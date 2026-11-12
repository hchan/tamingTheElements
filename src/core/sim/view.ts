import { GUARD_MAX, Q4_ONE, TAG_COOLDOWN_TICKS, TRAP_COOLDOWN_TICKS, TRAP_TEAM_MAX } from '../data/arcade';
import { CHARACTERS } from '../data/characters';
import type { Element } from '../data/elements';
import type { AbilityDef } from '../data/types';
import { capturable } from '../rules/progression';
import {
  ARCADE_E, ARCADE_T, ARCADE_TEAM_BASE, ARCADE_WORLD_BASE, ArcadeE, ArcadeT, ArcadeW, cooldownIdx, EntityFlag, EntityKind, MAX_ENTITIES, PATCH_MAX, TEAM_STRIDE, TeamField, TRAP_STRIDE, TRAP_TABLE, TRAP_WORLD_MAX, TrapF, World,
} from './state';
import { castDir } from './systems/arcade/aim';
import { RANGED } from './systems/arcade/meter';
import { isGuarding, isInvulnerable, isStunned } from './systems/arcade/stun';
import { isRooted } from './systems/arcade/snag';
import { trapCount } from './systems/arcade/trap';
import { CAPTURE_GRANTED_BIT } from './systems/capture';
import { slotAbility } from './systems/ability-info';
import { controlledId } from './systems/movement';
import { listStatuses } from './systems/status';
import { ABILITY_DEFS } from './systems/projectile';
import { SWAP_COOLDOWN_TICKS, tagTargets, teamMembers } from './systems/swap';

/** Capture sits after the character's own two ability slots (see systems/capture.ts). */
const CAPTURE_SLOT = 2;
import type { SimWorld } from './world';
import { cooldownTicksFor } from './arcade-numbers';
import { isArcade, isFrozen, now } from './clock';

/** One character as the renderer sees it. The object is reused between callbacks: copy what you keep. */
export interface RenderCharacter {
  id: number;
  team: number;
  /** Character sprite key (legacy map sprite name). */
  sprite: string;
  /** 4-way facing as a dir8 index: 0 east, 2 north, 4 west, 6 south (DIR8_X/Y). */
  dir: number;
  flags: number;
  x: number;
  y: number;
  px: number;
  py: number;
  w: number;
  h: number;
  hp: number;
  maxHp: number;
  /** Rest ceiling: benched characters heal up to this. */
  restCap: number;
  element: Element;
}

/** Arcade read-outs for the view (docs/FUN-DESIGN.md section 3). The object is reused between calls. */
export interface RenderArcade {
  /** True while a hit-stop (or another game-clock freeze) holds the game. */
  frozen: boolean;
  /** Live combo per team: hits (0 = none) and scaled damage so far. */
  readonly comboHits: [number, number];
  readonly comboDamage: [number, number];
  /** Hyper meter per team, 0..METER_MAX (1000 per bar). */
  readonly meter: [number, number];
  /** Round number (1-based; 0 before the first tick), its `RoundPhase` and the round timer in game ticks left. */
  round: number;
  phase: number;
  timer: number;
  /** Rounds won per team (a draw round counts for both). */
  readonly roundsWon: [number, number];
  stunned(id: number): boolean;
  invulnerable(id: number): boolean;
  /** The 8-way cast facing (dir8, 0 = east, then counter-clockwise on screen) of character `id`. */
  aim(id: number): number;
  /** Guard meter of character `id`, 0..GUARD_MAX (full when it never blocked), and whether it guards now (FUN-DESIGN 2.8). */
  guard(id: number): number;
  guarding(id: number): boolean;
  /** True while a Snag root holds character `id` (FUN-DESIGN 2.20). */
  rooted(id: number): boolean;
  /** Game ticks until character `id`'s melee Charge is ready (0: now), or -1 for a ranged hero, which has none (FUN-DESIGN 2.17). */
  chargeIn(id: number): number;
  /** Game ticks until character `id`'s next Dash is ready (0: now); read-out only (touch button words). */
  dashIn(id: number): number;
  /** The team's active (controlled) character id, or -1 with none; read-out only. */
  active(team: number): number;
  /** The weather up (a `Weather` kind, 0 none) and the game ticks it has left (0 with none), FUN-DESIGN 2.14. */
  weather: number;
  weatherLeft: number;
  /** Each team's weather charge, 0..WEATHER_CHARGE_FULL (FUN-DESIGN 2.14, WP 35). */
  weatherCharge: [number, number];
  /**
   * Stage terrain (FUN-DESIGN 2.15, WP 32 read-outs): the stage element as a weather kind (1 fire, 2 water, 3 earth, 4 air; 0
   * before round 1), the game ticks until a telegraphed stage swap lands (0 none) and the kind it heads for, and the live
   * patches: `patchCount` rectangles of 4 ints (x, y, w, h) in `patches`. The array is reused: copy what you keep.
   */
  stage: number;
  swapLeft: number;
  swapTo: number;
  patchCount: number;
  readonly patches: number[];
  /**
   * The trap table (WP 39): TRAP_WORLD_MAX entries of 6 ints (kind 0 = free else TrapKind, x, y, team, ticks until armed (0 =
   * armed), ticks of life left). x, y is the box's top-left corner. The array is reused: copy what you keep.
   */
  readonly traps: number[];
}

/** Ints per trap in `RenderArcade.traps`. */
export const TRAP_VIEW_STRIDE = 6;

/** One active status as the HUD sees it. The object is reused between callbacks. */
export interface RenderStatus {
  /** StatusId value. */
  id: number;
  startTick: number;
  expireTick: number;
}

/** One projectile as the renderer sees it. The object is reused between callbacks: copy what you keep. */
export interface RenderProjectile {
  id: number;
  team: number;
  /** Ability sprite key (`sprite:<key>` texture). */
  sprite: string;
  /** Dir8 index (DIR8_X/Y): 0 east, then counter-clockwise on screen; see `rotationForDir` in the view. */
  dir: number;
  x: number;
  y: number;
  px: number;
  py: number;
  w: number;
  h: number;
}

/** One ability slot of the action bar. `readyTick` is the first tick the slot can fire again. */
export interface RenderActionSlot {
  /** Ability sprite key (`sprite:<key>` texture). */
  sprite: string;
  readyTick: number;
  cooldownTicks: number;
}

/** One teammate swap slot: the character sprite and whether it can no longer be swapped to. */
export interface RenderSwapSlot {
  sprite: string;
  dead: boolean;
}

/** Action bar data for one team's active character; a snapshot, safe to keep. */
export interface RenderActionBar {
  /** Game clock (`now`) the ready ticks are measured against: `tick` in Classic, `gameTick` in Arcade. */
  tick: number;
  /** The character's own ability slots (primary, secondary). */
  abilities: RenderActionSlot[];
  /** Capture slot, or undefined when not granted (chapter 1) or for the AI side. */
  capture: (RenderActionSlot & { capturable: boolean }) | undefined;
  swaps: RenderSwapSlot[];
  swapReadyTick: number;
  swapCooldownTicks: number;
  /** Arcade Trap slot (WP 39): the first game tick it can plant again, its cooldown, the team's live traps and the cap. */
  trap: { readyTick: number; cooldownTicks: number; count: number; max: number } | undefined;
}

/** Read-only facade over a SimWorld for the renderer. Never exposes the sim arrays. */
export interface RenderView {
  readonly tick: number;
  /** Action bar of the team's active character, or undefined when the team has none. */
  actionBar(team: number): RenderActionBar | undefined;
  /** Visits the active statuses of one entity in slot order. */
  forEachStatus(id: number, visit: (st: RenderStatus) => void): void;
  /** Visits every live projectile entity, or with `melee` every live melee box (Ice Shock, Ground Shock, ...: the same shape, so the renderer can draw its sprite). */
  forEachProjectile(visit: (p: RenderProjectile) => void, melee?: boolean): void;
  /** Element of the first player-side character (picks the background), or undefined with no heroes. */
  heroElement(): Element | undefined;
  /** Visits every live character entity (benched and dead included; check `flags`). */
  forEachCharacter(visit: (c: RenderCharacter) => void): void;
  /** Arcade read-outs, or undefined in Classic. */
  arcade(): RenderArcade | undefined;
}

export function createRenderView(world: SimWorld): RenderView {
  const s = world.state;
  const scratch: RenderCharacter = { id: 0, team: 0, sprite: '', dir: 0, flags: 0, x: 0, y: 0, px: 0, py: 0, w: 0, h: 0, hp: 0, maxHp: 0, restCap: 0, element: 'void' };
  const pScratch: RenderProjectile = { id: 0, team: 0, sprite: '', dir: 0, x: 0, y: 0, px: 0, py: 0, w: 0, h: 0 };
  const eachBox = (kind: number, visit: (p: RenderProjectile) => void): void => {
    for (let i = 0; i < MAX_ENTITIES; i++) {
      if (s.kind[i] !== kind || ((s.flags[i] ?? 0) & EntityFlag.alive) === 0) continue;
      pScratch.id = i;
      pScratch.team = s.team[i] ?? 0;
      pScratch.sprite = ABILITY_DEFS[s.defId[i] ?? 0]?.sprite ?? '';
      pScratch.dir = s.dir[i] ?? 0;
      pScratch.x = s.x[i] ?? 0;
      pScratch.y = s.y[i] ?? 0;
      pScratch.px = s.px[i] ?? 0;
      pScratch.py = s.py[i] ?? 0;
      pScratch.w = s.w[i] ?? 0;
      pScratch.h = s.h[i] ?? 0;
      visit(pScratch);
    }
  };
  const ar: RenderArcade = {
    frozen: false, comboHits: [0, 0], comboDamage: [0, 0], meter: [0, 0], round: 0, phase: 0, timer: 0, roundsWon: [0, 0],
    weather: 0, weatherLeft: 0, weatherCharge: [0, 0], stage: 0, swapLeft: 0, swapTo: 0, patchCount: 0, patches: new Array<number>(PATCH_MAX * 4).fill(0),
    traps: new Array<number>(TRAP_WORLD_MAX * TRAP_VIEW_STRIDE).fill(0),
    stunned: (id) => isStunned(s, id), invulnerable: (id) => isInvulnerable(s, id), aim: (id) => castDir(s, id),
    guard: (id) => GUARD_MAX - (s.arcade[id * ARCADE_E + ArcadeE.guardDrain] ?? 0), guarding: (id) => isGuarding(s, id),
    rooted: (id) => isRooted(s, id),
    dashIn: (id) => Math.max(0, (s.arcade[id * ARCADE_E + ArcadeE.dashReadyAt] ?? 0) - now(s)),
    active: (team) => controlledId(world, team),
    chargeIn: (id) => (RANGED[s.defId[id] ?? 0] ? -1 : Math.max(0, (s.arcade[id * ARCADE_E + ArcadeE.chargeReadyAt] ?? 0) - now(s))),
  };
  const status: RenderStatus = { id: 0, startTick: 0, expireTick: 0 };
  const isCharacter = (i: number): boolean =>
    s.kind[i] === EntityKind.character && ((s.flags[i] ?? 0) & EntityFlag.alive) !== 0;
  return {
    get tick(): number {
      return s.world[World.tick] ?? 0;
    },
    actionBar(team): RenderActionBar | undefined {
      const cur = controlledId(world, team);
      if (cur < 0) return undefined;
      const tick = now(s);
      const base = team * TEAM_STRIDE;
      const slotOf = (def: AbilityDef | undefined, slot: number): RenderActionSlot => ({
        sprite: def?.sprite ?? '',
        readyTick: s.abil[cooldownIdx(cur, slot)] ?? 0,
        cooldownTicks: def === undefined ? 0 : cooldownTicksFor(def, isArcade(s)),
      });
      const ids = CHARACTERS[s.defId[cur] ?? 0]?.abilities ?? [];
      const abilities = ids.map((_, i) => slotOf(ABILITY_DEFS.find((d) => d.id === slotAbility(s, cur, i)), i));
      let capture: RenderActionBar['capture'];
      const enemy = controlledId(world, 1 - team);
      if (team === 0 && ((s.world[World.flags] ?? 0) & CAPTURE_GRANTED_BIT) !== 0) {
        capture = {
          ...slotOf(ABILITY_DEFS.find((d) => d.id === 'capture'), CAPTURE_SLOT),
          capturable: enemy >= 0 && capturable(s.hp[enemy] ?? 0, s.maxHp[enemy] ?? 0),
        };
      }
      // Arcade: slot N is what Tag N brings in (`tagTargets`: the living, in roster order), then the KO'd; Classic: roster order.
      const others = teamMembers(world, team).filter((m) => m !== cur);
      const order = isArcade(s) ? tagTargets(world, team, cur) : others;
      const swaps = [...order, ...others.filter((m) => !order.includes(m))]
        .map((m) => ({
          sprite: CHARACTERS[s.defId[m] ?? 0]?.sprite ?? '',
          dead: ((s.flags[m] ?? 0) & EntityFlag.dead) !== 0,
        }));
      return {
        tick,
        abilities,
        capture,
        swaps,
        swapReadyTick: s.teams[base + TeamField.swapCooldownUntil] ?? 0,
        swapCooldownTicks: isArcade(s) ? TAG_COOLDOWN_TICKS : SWAP_COOLDOWN_TICKS,
        trap: isArcade(s)
          ? { readyTick: s.arcade[cur * ARCADE_E + ArcadeE.trapReadyAt] ?? 0, cooldownTicks: TRAP_COOLDOWN_TICKS, count: trapCount(s, team), max: TRAP_TEAM_MAX }
          : undefined,
      };
    },
    forEachProjectile(visit, melee = false): void {
      eachBox(melee ? EntityKind.melee : EntityKind.projectile, visit);
    },
    heroElement(): Element | undefined {
      for (let i = 0; i < MAX_ENTITIES; i++) {
        if (isCharacter(i) && s.team[i] === 0) return CHARACTERS[s.defId[i] ?? 0]?.element;
      }
      return undefined;
    },
    forEachCharacter(visit): void {
      for (let i = 0; i < MAX_ENTITIES; i++) {
        if (!isCharacter(i)) continue;
        scratch.id = i;
        scratch.team = s.team[i] ?? 0;
        const def = CHARACTERS[s.defId[i] ?? 0];
        scratch.sprite = def?.sprite ?? '';
        scratch.element = def?.element ?? 'void';
        scratch.dir = s.dir[i] ?? 0;
        scratch.flags = s.flags[i] ?? 0;
        scratch.x = s.x[i] ?? 0;
        scratch.y = s.y[i] ?? 0;
        scratch.px = s.px[i] ?? 0;
        scratch.py = s.py[i] ?? 0;
        scratch.w = s.w[i] ?? 0;
        scratch.h = s.h[i] ?? 0;
        scratch.hp = s.hp[i] ?? 0;
        scratch.maxHp = s.maxHp[i] ?? 0;
        scratch.restCap = s.restCap[i] ?? 0;
        visit(scratch);
      }
    },
    arcade(): RenderArcade | undefined {
      if (!isArcade(s)) return undefined;
      ar.frozen = isFrozen(s);
      for (let t = 0; t < 2; t++) {
        const b = ARCADE_TEAM_BASE + t * ARCADE_T;
        ar.comboHits[t] = s.arcade[b + ArcadeT.comboHits] ?? 0;
        ar.comboDamage[t] = (s.arcade[b + ArcadeT.comboDamageQ4] ?? 0) / Q4_ONE;
        ar.meter[t] = s.arcade[b + ArcadeT.meter] ?? 0;
        ar.roundsWon[t] = s.arcade[b + ArcadeT.roundsWon] ?? 0;
        ar.weatherCharge[t] = s.arcade[b + ArcadeT.weatherCharge] ?? 0;
      }
      ar.round = s.arcade[ARCADE_WORLD_BASE + ArcadeW.round] ?? 0;
      ar.phase = s.arcade[ARCADE_WORLD_BASE + ArcadeW.phase] ?? 0;
      ar.timer = s.arcade[ARCADE_WORLD_BASE + ArcadeW.roundTimer] ?? 0;
      ar.weather = s.arcade[ARCADE_WORLD_BASE + ArcadeW.weather] ?? 0;
      ar.weatherLeft = ar.weather && Math.max(0, (s.arcade[ARCADE_WORLD_BASE + ArcadeW.weatherUntil] ?? 0) - now(s));
      const w = ARCADE_WORLD_BASE;
      const swapAt = s.arcade[w + ArcadeW.swapAt] ?? 0;
      ar.stage = s.arcade[w + ArcadeW.stage] ?? 0;
      ar.swapLeft = swapAt === 0 ? 0 : Math.max(0, swapAt - now(s));
      ar.swapTo = s.arcade[w + ArcadeW.swapTo] ?? 0;
      ar.patchCount = s.arcade[w + ArcadeW.patchCount] ?? 0;
      for (let i = 0; i < PATCH_MAX * 4; i++) ar.patches[i] = s.arcade[w + ArcadeW.patches + i] ?? 0;
      for (let i = 0; i < TRAP_WORLD_MAX; i++) {
        const b = w + TRAP_TABLE + i * TRAP_STRIDE;
        const o = i * TRAP_VIEW_STRIDE;
        const kind = s.arcade[b + TrapF.kind] ?? 0;
        ar.traps[o] = kind;
        ar.traps[o + 1] = s.arcade[b + TrapF.x] ?? 0;
        ar.traps[o + 2] = s.arcade[b + TrapF.y] ?? 0;
        ar.traps[o + 3] = s.arcade[b + TrapF.team] ?? 0;
        ar.traps[o + 4] = kind === 0 ? 0 : Math.max(0, (s.arcade[b + TrapF.armAt] ?? 0) - now(s));
        ar.traps[o + 5] = kind === 0 ? 0 : Math.max(0, (s.arcade[b + TrapF.endAt] ?? 0) - now(s));
      }
      return ar;
    },
    forEachStatus(id, visit): void {
      for (const st of listStatuses(s, id)) {
        status.id = st.id;
        status.startTick = st.startTick;
        status.expireTick = st.expireTick;
        visit(status);
      }
    },
  };
}
