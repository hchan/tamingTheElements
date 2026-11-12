import { STREAM_NAMES } from '../rng/streams';

/** Capacity constants. Entity id == slot index. */
export const MAX_ENTITIES = 64;
export const TEAM_COUNT = 2;
export const ABILITY_SLOTS = 4;
export const MAX_ABILITY_DEFS = 32;
/** Status slots per entity, each STATUS_STRIDE ints: [id, sourceId, startTick, expireTick, magnitude]; id 0 = empty. */
export const STATUS_SLOTS = 8;
export const STATUS_STRIDE = 5;
export const RNG_WORDS = STREAM_NAMES.length * 4;

export const EntityKind = { character: 0, projectile: 1, melee: 2, effect: 3 } as const;
export type EntityKindValue = (typeof EntityKind)[keyof typeof EntityKind];

export const EntityFlag = {
  alive: 1,
  translucent: 2,
  frozen: 4,
  captured: 8,
  benched: 16,
  /** Killed character: keeps `alive` so its slot is not reallocated; also set benched. */
  dead: 32,
} as const;

/** Indices into SimState.world (Int32Array). */
export const World = { tick: 0, nextId: 1, flags: 2, matchSeed: 3 } as const;
export const WORLD_SLOTS = 4;

/** Per-team block in SimState.teams (Int32Array), TEAM_STRIDE ints per team: [activeSlot, swapCooldownUntil]. */
export const TeamField = { activeSlot: 0, swapCooldownUntil: 1 } as const;
export const TEAM_STRIDE = 2;

/**
 * Per-character ability block in SimState.abil (Int32Array), ABIL_STRIDE ints per entity id:
 * [cooldownUntil x ABILITY_SLOTS, activeCount x ABILITY_SLOTS]. Legacy deep-copies `abilitiesInfo` (lastUsed,
 * curCount) into every character, so cooldowns and active counts belong to the character, not to its team or slot.
 * Slots: 0 primary, 1 secondary, 2 Capture.
 */
export const ABIL_ACTIVE_COUNTS = ABILITY_SLOTS;
export const ABIL_STRIDE = 2 * ABILITY_SLOTS;
/** Index of a character's cooldown deadline (game tick from which it may cast again) for an ability slot. */
export const cooldownIdx = (id: number, slot: number): number => id * ABIL_STRIDE + slot;
/** Index of a character's active count (legacy `curCount`) for an ability slot. */
export const countIdx = (id: number, slot: number): number => id * ABIL_STRIDE + ABIL_ACTIVE_COUNTS + slot;

/**
 * Arcade block in SimState.arcade (Int32Array), docs/FUN-DESIGN.md section 2.1. Empty (length 0) in Classic, so it adds
 * no bytes to the hash or snapshot. Layout: ARCADE_E ints per entity (id * ARCADE_E + field), then ARCADE_T per team
 * (ARCADE_TEAM_BASE + team * ARCADE_T + field), then ARCADE_W world ints (ARCADE_WORLD_BASE + field).
 * Knockback speeds are Q4 (1/16 px per tick); `wallBounced` is 1 once the victim bounced off a wall in this combo.
 * `aim` is the 8-way cast facing plus one (0 = no input yet: the 4-way `dir`), see systems/arcade/aim.ts.
 * `dashUntil` is the game tick a dash ends (start + DASH_TICKS), `dashReadyAt` the first tick of the next dash and
 * `dashDodged` 1 once the dash scored its perfect dodge (systems/arcade/dash.ts). `blockUntil` ends the block-stun,
 * `guardDrain` is GUARD_MAX minus the guard meter (so a zeroed block is a full meter), `parryUntil` ends the parry window
 * and `parryLockUntil` the whiff lock, all game ticks (systems/arcade/guard.ts). `weatherReadyAt` is the game tick of
 * the character's next weather cast (a lockout); `chargeUntil` is the game tick a charge ends (start + CHARGE_TICKS, 0 = none) and `chargeReadyAt` the first tick of the next one (systems/arcade/charge.ts); its cast recovery ends WEATHER_COOLDOWN_TICKS - WEATHER_RECOVERY_TICKS before it.
 * `rootUntil` is the game tick a Snag root ends (0 = not rooted) and `rootImmuneUntil` the end of the immunity after it
 * (systems/arcade/snag.ts). `trapReadyAt` is the game tick of the character's next trap cast (its cast recovery ends
 * TRAP_COOLDOWN_TICKS - TRAP_CAST_TICKS before it) and `trapSlowUntil` the end of a Puddle's linger (systems/arcade/trap.ts).
 * `elemReadyAt` is the game tick of the character's next elemental ability and `elemUntil` the end of its timed buff (0 =
 * none; Ember, Gale or Stoneskin by the caster's element, systems/arcade/elemental.ts).
 */
export const ArcadeE = {
  stunUntil: 0, kbVx: 1, kbVy: 2, juggle: 3, invulnUntil: 4, dashUntil: 5, dashReadyAt: 6, blockUntil: 7,
  parryUntil: 8, parryLockUntil: 9, guardDrain: 10, comboStunTotal: 11, wallBounced: 12, aim: 13,
  dashDodged: 14, weatherReadyAt: 15, chargeUntil: 16, chargeReadyAt: 17, rootUntil: 18, rootImmuneUntil: 19,
  trapReadyAt: 20, trapSlowUntil: 21, elemReadyAt: 22, elemUntil: 23,
} as const;
export const ARCADE_E = 24;
/**
 * Per team; `pressTick` is 9 ints (primary, secondary, dash, guard, super, weather, charge, trap, elemental): the game tick of the last rising edge plus
 * one (0 = none). `prevCmd` is the last raw command; `pressUsed` has bit k set once press k ran, and CHORD_FLAG while a
 * chord's super press is pending (see systems/arcade/buffer.ts). `lastDir` is the bit of the last rising direction edge
 * and `lastDirPress` its game tick plus one (the double-tap dash); `confirmTick` is the game tick plus one of the team's
 * last confirmed hit (the dash cancel window). `weatherCharge` is the weather charge, 0..WEATHER_CHARGE_FULL (weather.ts).
 */
export const ArcadeT = {
  meter: 0, comboHits: 1, comboDamageQ4: 2, comboStart: 3, prevCmd: 4, pressTick: 5, lastDirPress: 14, lastDir: 15,
  roundsWon: 16, superState: 17, pressUsed: 18, confirmTick: 19, weatherCharge: 20, inPatch: 21,
} as const;
export const ARCADE_T = 22;
/**
 * World ints. `gameTick` is the game clock (see sim/clock.ts); `freezeUntil`, `phaseUntil` and `slowMoUntil` are in
 * W.tick units, `roundTimer` in game ticks left. `phase` is a RoundPhase (data/arcade.ts); `roundWinner` holds the
 * KO'd round's winner (-1 = draw) until `roundEnded` (systems/arcade/round.ts). The weather slot (FUN-DESIGN 2.14,
 * systems/arcade/weather.ts): `weather` is a Weather kind (0 none), `weatherUntil` the game tick it ends (ticks left
 * = weatherUntil - now) and `weatherTeam` the team whose cast set or last refreshed it.
 * The terrain slots (FUN-DESIGN 2.15, systems/arcade/terrain.ts): `stage` is the stage element as a weather kind (1 fire,
 * 2 water, 3 earth, 4 air), `swapAt` the game tick a telegraphed swap lands (0 none) towards `swapTo`, `terrainGen` the
 * layouts drawn so far (it seeds the next draw), `patchCount` the live patches and `patches` their rectangles.
 * The trap table (WP 39, systems/arcade/trap.ts) follows the patches: TRAP_WORLD_MAX entries of TRAP_STRIDE ints from
 * `TRAP_TABLE` (kind 0 = a free entry; never compacted, scanned in index order).
 */
export const ArcadeW = {
  gameTick: 0, freezeUntil: 1, freezeKind: 2, round: 3, phase: 4, phaseUntil: 5, roundTimer: 6, slowMoUntil: 7,
  roundWinner: 8, weather: 9, weatherUntil: 10, weatherTeam: 11,
  stage: 12, swapAt: 13, swapTo: 14, terrainGen: 15, patchCount: 16, patches: 17,
} as const;
/** Terrain patches (FUN-DESIGN 2.15): at most PATCH_MAX rectangles of 4 ints (x, y, w, h) from `ArcadeW.patches`. */
export const PATCH_MAX = 5;
/** Trap table (WP 39): TRAP_WORLD_MAX entries of TRAP_STRIDE ints, fields at `TrapF` (systems/arcade/trap.ts). */
export const TRAP_WORLD_MAX = 4;
export const TRAP_STRIDE = 7;
export const TrapF = { kind: 0, x: 1, y: 2, team: 3, armAt: 4, endAt: 5, owner: 6 } as const;
export const TRAP_TABLE = ArcadeW.patches + PATCH_MAX * 4;
export const ARCADE_W = TRAP_TABLE + TRAP_WORLD_MAX * TRAP_STRIDE;
export const ARCADE_TEAM_BASE = MAX_ENTITIES * ARCADE_E;
export const ARCADE_WORLD_BASE = ARCADE_TEAM_BASE + TEAM_COUNT * ARCADE_T;
export const ARCADE_LENGTH = ARCADE_WORLD_BASE + ARCADE_W;

export const F64_FIELDS = [
  'x', 'y', 'px', 'py', 'vx', 'vy', 'w', 'h', 'hp', 'maxHp', 'dmgMult', 'healMult', 'speed', 'baseSpeed', 'restCap',
] as const;
/** `expireTick`: melee/effect expiry; for a character, the next rest-heal tick (0 = no timer, systems/rest.ts). */
export const I32_FIELDS = [
  'kind', 'defId', 'team', 'owner', 'dir', 'flags', 'spawnTick', 'expireTick', 'hitMask',
] as const;

type F64Name = (typeof F64_FIELDS)[number];
type I32Name = (typeof I32_FIELDS)[number];

export type SimState = { readonly [K in F64Name]: Float64Array } & {
  readonly [K in I32Name]: Int32Array;
} & {
  /** Per-team block (activeSlot, swap cooldown); NOT the per-entity `team`. */
  readonly teams: Int32Array;
  /** Per-character ability cooldowns and active counts (ABIL_STRIDE per entity id, see cooldownIdx/countIdx). */
  readonly abil: Int32Array;
  /** Per-entity status slots (see systems/status.ts), MAX_ENTITIES x STATUS_SLOTS x STATUS_STRIDE. */
  readonly status: Int32Array;
  readonly world: Int32Array;
  /** 5 sim streams x 4 words, STREAM_NAMES order (see saveStreams/loadStreams); agent streams are not here. */
  readonly rng: Uint32Array;
  /** Arcade block (ArcadeE/ArcadeT/ArcadeW); length 0 in Classic. */
  readonly arcade: Int32Array;
};

/** `arcade` sizes the Arcade block: ARCADE_LENGTH when the Arcade ruleset is on, else 0 (Classic). */
export function createSimState(matchSeed = 0, arcade = false): SimState {
  const s: Record<string, Float64Array | Int32Array | Uint32Array> = {};
  for (const f of F64_FIELDS) s[f] = new Float64Array(MAX_ENTITIES);
  for (const f of I32_FIELDS) s[f] = new Int32Array(MAX_ENTITIES);
  s['status'] = new Int32Array(MAX_ENTITIES * STATUS_SLOTS * STATUS_STRIDE);
  s['teams'] = new Int32Array(TEAM_COUNT * TEAM_STRIDE);
  s['abil'] = new Int32Array(MAX_ENTITIES * ABIL_STRIDE);
  s['world'] = new Int32Array(WORLD_SLOTS);
  s['rng'] = new Uint32Array(RNG_WORDS);
  s['arcade'] = new Int32Array(arcade ? ARCADE_LENGTH : 0);
  const state = s as unknown as SimState;
  state.world[World.matchSeed] = matchSeed | 0;
  return state;
}

type AnyArray = Float64Array | Int32Array | Uint32Array;

/** Every backing array in a fixed order; snapshot, restore and hashing all follow it. `arcade` is empty in Classic. */
export function stateArrays(s: SimState): AnyArray[] {
  return [...F64_FIELDS.map((f) => s[f]), ...I32_FIELDS.map((f) => s[f]), s.teams, s.abil, s.status, s.world, s.rng, s.arcade];
}

export type SimSnapshot = AnyArray[];

/** Deep copy of all arrays. */
export function snapshotState(s: SimState): SimSnapshot {
  return stateArrays(s).map((a) => a.slice());
}

/** Exact inverse of snapshotState. */
export function restoreState(s: SimState, snap: SimSnapshot): void {
  const arrs = stateArrays(s);
  if (snap.length !== arrs.length) throw new RangeError('bad snapshot');
  arrs.forEach((a, i) => {
    const src = snap[i];
    if (src?.length !== a.length) throw new RangeError('bad snapshot array length');
    (a as Float64Array).set(src);
  });
}
