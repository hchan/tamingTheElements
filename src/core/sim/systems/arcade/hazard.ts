import {
  HAZARD_ACTIVE_TICKS, HAZARD_DAMAGE_PM, HAZARD_FIRST_TICKS, HAZARD_GUST_AIR_PX, HAZARD_GUST_H, HAZARD_GUST_PX,
  HAZARD_JITTER_TICKS, HAZARD_LAVA_LANES, HAZARD_LAVA_W, HAZARD_PERIOD_TICKS, HAZARD_ROCK_PX, HAZARD_TIDE_PX,
  HAZARD_WARN_TICKS, HP_PM,
} from '../../../data/arcade';
import { seedSfc32 } from '../../../rng/seed';
import { inFight, now } from '../../clock';
import { SimEventKind, type EventSink } from '../../events';
import { ARCADE_E, ARCADE_WORLD_BASE, ArcadeE, HAZARD_BASE, HazardF, TEAM_COUNT, World as W, type SimState } from '../../state';
import type { SimWorld } from '../../world';
import { controlledId } from '../movement';
import { dashTick, isInvulnerable } from './stun';
import { stageOf } from './terrain';

/**
 * Stage hazards (SIM_VERSION 54, ideas/brainstorm/stage-selection-hazards.md): one telegraphed hazard of the stage's element
 * at a time, run at the end of the `traps` slot (so game ticks only: a freeze or a super pauses it). Times, sizes and
 * damage are in data/arcade.ts (HAZARD_*). Each draw uses its own stream, `hazard.<gen>` of the match seed, so the state
 * is just the counter. A live hazard ends quietly when the stage changes under it or the fight phase ends; the round
 * reset clears the schedule (the counter stays, so every round draws new lanes).
 */

const FIRE = 1;
const WATER = 2;
const EARTH = 3;
const AIR = 4;
const H = (f: number): number => ARCADE_WORLD_BASE + HAZARD_BASE + f;

/** Clears the live hazard (`next` too when `schedule`), keeping the draw counter. No event. */
function clearLive(s: SimState, schedule: boolean): void {
  s.arcade.fill(0, H(schedule ? HazardF.next : HazardF.kind), H(HazardF.gen));
}

/** Round reset: no live hazard and no schedule (the next fight starts its own HAZARD_FIRST_TICKS); the draw counter stays. */
export function clearHazard(s: SimState): void {
  clearLive(s, true);
}

/** The live hazard's kind (1 fire .. 4 air; 0 none) and whether it is past its warning. */
export function hazardOf(s: SimState): { readonly kind: number; readonly active: boolean } {
  const kind = s.arcade[H(HazardF.kind)] ?? 0;
  return { kind, active: kind !== 0 && (s.arcade[H(HazardF.strikeAt)] ?? 0) === 0 };
}

/** True when `id`'s box overlaps the live hazard's box. */
function inHazard(s: SimState, id: number): boolean {
  const a = s.arcade;
  const hx = a[H(HazardF.x)] ?? 0;
  const hy = a[H(HazardF.y)] ?? 0;
  const x = s.x[id] ?? 0;
  const y = s.y[id] ?? 0;
  return x < hx + (a[H(HazardF.w)] ?? 0) && hx < x + (s.w[id] ?? 0) && y < hy + (a[H(HazardF.h)] ?? 0) && hy < y + (s.h[id] ?? 0);
}

/**
 * Draws and starts a warning of `kind` (the stage) at game tick `g`: its box, its direction, its strike and end ticks and
 * the next warning's tick. Emits `hazardWarn {hazard, x, y, w, h, dir, ticks}`.
 */
function warn(world: SimWorld, sink: EventSink, kind: number, g: number): void {
  const s = world.state;
  const a = s.arcade;
  const ar = world.arena;
  const gen = a[H(HazardF.gen)] ?? 0;
  const rng = seedSfc32(s.world[W.matchSeed] ?? 0, `hazard.${String(gen)}`);
  a[H(HazardF.gen)] = gen + 1;
  let x = ar.x;
  let y = ar.y;
  let w = ar.w;
  let h = ar.h;
  let dir = 0;
  if (kind === FIRE) {
    const lane = rng.int(HAZARD_LAVA_LANES);
    w = HAZARD_LAVA_W;
    x = ar.x + Math.trunc((ar.w * (lane + 1)) / (HAZARD_LAVA_LANES + 1)) - w / 2;
  } else if (kind === EARTH) {
    const team = rng.int(TEAM_COUNT);
    const id = controlledId(world, team) >= 0 ? controlledId(world, team) : controlledId(world, 1 - team);
    const cx = id >= 0 ? (s.x[id] ?? 0) + (s.w[id] ?? 0) / 2 : ar.x + ar.w / 2;
    const cy = id >= 0 ? (s.y[id] ?? 0) + (s.h[id] ?? 0) / 2 : ar.y + ar.h / 2;
    w = HAZARD_ROCK_PX;
    h = HAZARD_ROCK_PX;
    x = Math.trunc(Math.min(Math.max(cx - w / 2, ar.x), ar.x + ar.w - w));
    y = Math.trunc(Math.min(Math.max(cy - h / 2, ar.y), ar.y + ar.h - h));
  } else {
    dir = rng.int(2) === 0 ? -1 : 1;
    if (kind === AIR) {
      h = HAZARD_GUST_H;
      y = ar.y + rng.int(ar.h - h + 1);
    }
  }
  const strikeAt = g + HAZARD_WARN_TICKS;
  const endAt = strikeAt + (HAZARD_ACTIVE_TICKS[kind] ?? 0);
  a[H(HazardF.kind)] = kind;
  a[H(HazardF.strikeAt)] = strikeAt;
  a[H(HazardF.endAt)] = endAt;
  a[H(HazardF.x)] = x;
  a[H(HazardF.y)] = y;
  a[H(HazardF.w)] = w;
  a[H(HazardF.h)] = h;
  a[H(HazardF.dir)] = dir;
  a[H(HazardF.next)] = endAt + HAZARD_PERIOD_TICKS + rng.int(HAZARD_JITTER_TICKS);
  sink.emit(0, SimEventKind.hazardWarn, { hazard: kind, x, y, w, h, dir, ticks: HAZARD_WARN_TICKS });
}

/**
 * The strike tick of a fire or earth hazard: each team's controlled fighter in the box that is alive and not invulnerable
 * loses HAZARD_DAMAGE_PM of its max HP, but never its last HP (`hazardHit {team, amount, hazard}`, sourceId: the fighter).
 * No hit-stun, combo, guard or meter.
 */
function strike(world: SimWorld, sink: EventSink, kind: number): void {
  const s = world.state;
  const pm = HAZARD_DAMAGE_PM[kind] ?? 0;
  if (pm === 0) return;
  for (let team = 0; team < TEAM_COUNT; team++) {
    const id = controlledId(world, team);
    const hp = id >= 0 ? (s.hp[id] ?? 0) : 0;
    if (hp <= 0 || isInvulnerable(s, id) || !inHazard(s, id)) continue;
    const amount = Math.min(Math.max(1, Math.floor(((s.maxHp[id] ?? 0) * pm) / HP_PM)), hp - 1);
    if (amount <= 0) continue;
    s.hp[id] = hp - amount;
    sink.emit(id, SimEventKind.hazardHit, { team, amount, hazard: kind });
  }
}

/**
 * An active tide (the whole field) or gust (its band) moves each team's controlled, living fighter `dir` px per game
 * tick: HAZARD_TIDE_PX, or HAZARD_GUST_PX (HAZARD_GUST_AIR_PX while dashing or knocked back), clamped to the arena.
 */
function drift(world: SimWorld, kind: number): void {
  const s = world.state;
  const a = s.arcade;
  const ar = world.arena;
  const dir = a[H(HazardF.dir)] ?? 0;
  for (let team = 0; team < TEAM_COUNT; team++) {
    const id = controlledId(world, team);
    if (id < 0 || (s.hp[id] ?? 0) <= 0) continue;
    let px = HAZARD_TIDE_PX;
    if (kind === AIR) {
      if (!inHazard(s, id)) continue;
      const e = id * ARCADE_E;
      const airborne = dashTick(s, id) > 0 || (a[e + ArcadeE.kbVx] ?? 0) !== 0 || (a[e + ArcadeE.kbVy] ?? 0) !== 0;
      px = airborne ? HAZARD_GUST_AIR_PX : HAZARD_GUST_PX;
    }
    s.x[id] = Math.min(Math.max((s.x[id] ?? 0) + dir * px, ar.x), ar.x + ar.w - (s.w[id] ?? 0));
  }
}

/**
 * The hazard pass (end of the `traps` slot, Arcade only). Outside the fight phase there is none. Idle: the first fight
 * tick schedules the first warning HAZARD_FIRST_TICKS ahead; on the scheduled tick a warning of the stage's element
 * starts (`warn`). Live: it ends quietly if the stage changed; on its strike tick `hazardStrike {hazard}` and the fire or
 * earth damage; while active a tide or gust drifts; at its end tick it is gone.
 */
export function stepHazard(world: SimWorld, sink: EventSink): void {
  const s = world.state;
  const a = s.arcade;
  if (!inFight(s)) {
    if ((a[H(HazardF.kind)] ?? 0) !== 0) clearLive(s, false);
    return;
  }
  const g = now(s);
  const stage = stageOf(s);
  let kind = a[H(HazardF.kind)] ?? 0;
  if (kind !== 0 && kind !== stage) {
    clearLive(s, false);
    kind = 0;
  }
  if (kind === 0) {
    const next = a[H(HazardF.next)] ?? 0;
    if (next === 0) a[H(HazardF.next)] = g + HAZARD_FIRST_TICKS;
    else if (g >= next && stage >= FIRE && stage <= AIR) warn(world, sink, stage, g);
    return;
  }
  const strikeAt = a[H(HazardF.strikeAt)] ?? 0;
  if (strikeAt !== 0) {
    if (g < strikeAt) return;
    a[H(HazardF.strikeAt)] = 0;
    sink.emit(0, SimEventKind.hazardStrike, { hazard: kind });
    strike(world, sink, kind);
  }
  if (kind === WATER || kind === AIR) drift(world, kind);
  if (g >= (a[H(HazardF.endAt)] ?? 0)) clearLive(s, false);
}
