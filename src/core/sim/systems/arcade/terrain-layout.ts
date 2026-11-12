import { ARCADE_P1_START_X, ARCADE_P2_START_X, ARCADE_START_Y } from '../../../data/arcade';
import { CHARACTER_HEIGHT, CHARACTER_WIDTH } from '../../../data/chapters';
import { seedSfc32 } from '../../../rng/seed';
import {
  TERRAIN_COUNT_MIN, TERRAIN_COUNT_SPAN, TERRAIN_DRAWS, TERRAIN_GAP, TERRAIN_SIDE_MIN, TERRAIN_SIDE_STEP,
  TERRAIN_SIDE_STEPS, TERRAIN_TELEGRAPH_TICKS, TERRAIN_TRIES, TERRAIN_WATER_EVERY, TERRAIN_WATER_HEAL_PM,
} from '../../arcade-numbers';
import { inFight, now } from '../../clock';
import { SimEventKind, type EventSink } from '../../events';
import {
  ARCADE_T, ARCADE_TEAM_BASE, ARCADE_WORLD_BASE, ArcadeT, ArcadeW, EntityFlag, EntityKind, MAX_ENTITIES, PATCH_MAX,
  TEAM_COUNT, World as W, type SimState,
} from '../../state';
import type { SimWorld } from '../../world';
import { controlledId } from '../movement';
import { onPatch, stageOf } from './terrain';

/**
 * Terrain layout, swap and per-tick pass (FUN-DESIGN 2.15, WP-arcade-terrain); the queries are in terrain.ts.
 */
const AW = (f: number): number => ARCADE_WORLD_BASE + f;
const STAGE = AW(ArcadeW.stage);
const SWAP_AT = AW(ArcadeW.swapAt);
const SWAP_TO = AW(ArcadeW.swapTo);
const GEN = AW(ArcadeW.terrainGen);
const COUNT = AW(ArcadeW.patchCount);
const P0 = AW(ArcadeW.patches);
/** The Arcade start spots of the two teams (the ones `createMatch` and the round reset use; a test pins the equality). */
const SPAWN_X = [ARCADE_P1_START_X, ARCADE_P2_START_X] as const;

/** True when the box overlaps any `keep-clear` box (x, y, w, h flat) grown by TERRAIN_GAP on every side. */
function crowded(boxes: readonly number[], x: number, y: number, w: number, h: number): boolean {
  for (let i = 0; i < boxes.length; i += 4) {
    const bx = boxes[i] ?? 0;
    const by = boxes[i + 1] ?? 0;
    if (x < bx + (boxes[i + 2] ?? 0) + TERRAIN_GAP && bx - TERRAIN_GAP < x + w && y < by + (boxes[i + 3] ?? 0) + TERRAIN_GAP && by - TERRAIN_GAP < y + h) return true;
  }
  return false;
}

/**
 * Draws a layout (FUN-DESIGN 2.15) from the layout counter's own stream, `terrain.<n>` of the match seed (a fresh
 * stream per draw, so the state is just the counter): 3 to 5 patches, point-symmetric about the playfield centre (an
 * odd count has a centre patch, the rest are mirrored pairs), inside the playfield and TERRAIN_GAP clear of its edges,
 * of each other and of every spawn, hero and projectile on the field. The first draw also picks the stage.
 */
function generate(world: SimWorld, sink: EventSink): void {
  const s = world.state;
  const a = s.arcade;
  const pf = world.arena;
  const rng = seedSfc32(s.world[W.matchSeed] ?? 0, `terrain.${String(a[GEN] ?? 0)}`);
  a[GEN] = (a[GEN] ?? 0) + 1;
  if ((a[STAGE] ?? 0) === 0) a[STAGE] = 1 + rng.int(4);
  const n = TERRAIN_COUNT_MIN + rng.int(TERRAIN_COUNT_SPAN);
  const boxes: number[] = [];
  const spawn = (x: number, y: number): void => void boxes.push(x, y, CHARACTER_WIDTH, CHARACTER_HEIGHT);
  for (const x of SPAWN_X) spawn(x, ARCADE_START_Y);
  for (let id = 0; id < MAX_ENTITIES; id++) {
    const f = s.flags[id] ?? 0;
    const k = s.kind[id];
    if ((f & EntityFlag.alive) !== 0 && (f & EntityFlag.benched) === 0 && (k === EntityKind.character || k === EntityKind.projectile)) {
      boxes.push(s.x[id] ?? 0, s.y[id] ?? 0, s.w[id] ?? 0, s.h[id] ?? 0);
    }
  }
  const side = (): number => TERRAIN_SIDE_MIN + rng.int(TERRAIN_SIDE_STEPS) * TERRAIN_SIDE_STEP;
  const lox = pf.x + TERRAIN_GAP;
  const loy = pf.y + TERRAIN_GAP;
  const placed: number[] = [];
  const fixed = boxes.length;
  const add = (x: number, y: number, w: number, h: number): void => {
    boxes.push(x, y, w, h);
    placed.push(x, y, w, h);
  };
  const mx = pf.x * 2 + pf.w;
  const my = pf.y * 2 + pf.h;
  const pair = (): void => {
    for (let t = 0; t < TERRAIN_TRIES; t++) {
      const w = side();
      const h = side();
      const x = lox + rng.int(pf.w - 2 * TERRAIN_GAP - w + 1);
      const y = loy + rng.int(pf.h - 2 * TERRAIN_GAP - h + 1);
      // The mirror is the same size, so it is inside the margins too; it must also keep clear of its twin.
      const x2 = mx - x - w;
      const y2 = my - y - h;
      if (crowded(boxes, x, y, w, h) || crowded(boxes, x2, y2, w, h) || crowded([x, y, w, h], x2, y2, w, h)) continue;
      add(x, y, w, h);
      add(x2, y2, w, h);
      return;
    }
  };
  // The spawn zones leave only the middle band free, so a draw can come out short: it is redone (up to TERRAIN_DRAWS
  // times) until it has the minimum count. The centre patch (odd counts) is centred on the playfield centre (the sides
  // are even: whole pixels) and goes first (also on a redraw: an even count rarely fits), then the mirrored pairs.
  for (let draw = 0; draw < TERRAIN_DRAWS && placed.length < TERRAIN_COUNT_MIN * 4; draw++) {
    placed.length = 0;
    boxes.length = fixed;
    for (let t = 0; t < TERRAIN_TRIES && ((n & 1) === 1 || draw > 0) && placed.length === 0; t++) {
      const w = side();
      const h = side();
      if (!crowded(boxes, (mx - w) / 2, (my - h) / 2, w, h)) add((mx - w) / 2, (my - h) / 2, w, h);
    }
    for (let k = 0; k < n >> 1; k++) pair();
  }
  a.fill(0, P0, P0 + PATCH_MAX * 4);
  a.set(placed, P0);
  a[COUNT] = placed.length >> 2;
  sink.emit(0, SimEventKind.terrainChanged, { stage: a[STAGE] ?? 0, count: a[COUNT] ?? 0 });
}

/**
 * A round starts (FUN-DESIGN 2.15, called from `startRound` after the reset): a pending swap lands now, then the layout
 * is drawn again (round 1 also picks the stage from the seed).
 */
export function terrainRound(world: SimWorld, sink: EventSink): void {
  const a = world.state.arcade;
  if ((a[SWAP_AT] ?? 0) !== 0) a[STAGE] = a[SWAP_TO] ?? 0;
  a[SWAP_AT] = 0;
  generate(world, sink);
}

/**
 * A weather of kind `kind` (1 sun .. 4 gale, 5 eclipse) was cast at game tick `g`: the stage heads for its element
 * after TERRAIN_TELEGRAPH_TICKS (`terrainSwap {stage, ticks}`). The same weather again keeps the patches, and a cast back to
 * the standing stage cancels a pending swap; eclipse has no terrain.
 */
export function castTerrain(s: SimState, sink: EventSink, kind: number, g: number): void {
  const a = s.arcade;
  if (kind > 4 || kind === ((a[SWAP_AT] ?? 0) !== 0 ? a[SWAP_TO] : a[STAGE])) return;
  const back = kind === a[STAGE];
  a[SWAP_AT] = back ? 0 : g + TERRAIN_TELEGRAPH_TICKS;
  a[SWAP_TO] = kind;
  if (!back) sink.emit(0, SimEventKind.terrainSwap, { stage: kind, ticks: TERRAIN_TELEGRAPH_TICKS });
}

/**
 * The terrain pass of the `input` slot (unfrozen ticks, after the weather pass): a swap whose telegraph ran out lands
 * with a new layout; then for each team's controlled hero `patchEntered`/`patchLeft {team, stage}` when it steps on or off
 * a patch of its element, and in the fight a water hero on a patch heals TERRAIN_WATER_HEAL_PM of its max HP every
 * TERRAIN_WATER_EVERY game ticks (`patchHeal {amount}`).
 */
export function terrainTick(world: SimWorld, sink: EventSink): void {
  const s = world.state;
  const a = s.arcade;
  const g = now(s);
  if ((a[SWAP_AT] ?? 0) !== 0 && g >= (a[SWAP_AT] ?? 0)) {
    a[STAGE] = a[SWAP_TO] ?? 0;
    a[SWAP_AT] = 0;
    generate(world, sink);
  }
  for (let team = 0; team < TEAM_COUNT; team++) {
    const id = controlledId(world, team);
    if (id < 0) continue;
    const flag = ARCADE_TEAM_BASE + team * ARCADE_T + ArcadeT.inPatch;
    const on = onPatch(s, id) ? 1 : 0;
    if (on !== (a[flag] ?? 0)) sink.emit(id, on === 1 ? SimEventKind.patchEntered : SimEventKind.patchLeft, { team, stage: stageOf(s) });
    a[flag] = on;
    const max = s.maxHp[id] ?? 0;
    if (on === 0 || stageOf(s) !== 2 || !inFight(s) || g % TERRAIN_WATER_EVERY !== 0 || (s.hp[id] ?? 0) >= max || (s.hp[id] ?? 0) <= 0) continue;
    const before = s.hp[id] ?? 0;
    s.hp[id] = Math.min(max, before + (max * TERRAIN_WATER_HEAL_PM) / 1000);
    sink.emit(id, SimEventKind.patchHeal, { amount: (s.hp[id] ?? 0) - before });
  }
}
