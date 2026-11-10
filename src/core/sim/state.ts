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

/**
 * Per-team block in SimState.teams (Int32Array), TEAM_STRIDE ints per team:
 * [activeSlot, swapCooldownUntil, abilityCooldownUntil x ABILITY_SLOTS, activeCount x MAX_ABILITY_DEFS].
 */
export const TeamField = { activeSlot: 0, swapCooldownUntil: 1 } as const;
export const TEAM_COOLDOWNS = 2;
export const TEAM_ACTIVE_COUNTS = TEAM_COOLDOWNS + ABILITY_SLOTS;
export const TEAM_STRIDE = TEAM_ACTIVE_COUNTS + MAX_ABILITY_DEFS;

export const F64_FIELDS = [
  'x', 'y', 'px', 'py', 'vx', 'vy', 'w', 'h', 'hp', 'maxHp', 'dmgMult', 'healMult', 'speed', 'baseSpeed', 'restCap',
] as const;
export const I32_FIELDS = [
  'kind', 'defId', 'team', 'owner', 'dir', 'flags', 'spawnTick', 'expireTick', 'hitMask',
] as const;

type F64Name = (typeof F64_FIELDS)[number];
type I32Name = (typeof I32_FIELDS)[number];

export type SimState = { readonly [K in F64Name]: Float64Array } & {
  readonly [K in I32Name]: Int32Array;
} & {
  /** Per-team block (activeSlot, swap cooldown, ability cooldowns, active counts); NOT the per-entity `team`. */
  readonly teams: Int32Array;
  /** Per-entity status slots (see systems/status.ts), MAX_ENTITIES x STATUS_SLOTS x STATUS_STRIDE. */
  readonly status: Int32Array;
  readonly world: Int32Array;
  /** 5 sim streams x 4 words, STREAM_NAMES order (see saveStreams/loadStreams); agent streams are not here. */
  readonly rng: Uint32Array;
};

export function createSimState(matchSeed = 0): SimState {
  const s: Record<string, Float64Array | Int32Array | Uint32Array> = {};
  for (const f of F64_FIELDS) s[f] = new Float64Array(MAX_ENTITIES);
  for (const f of I32_FIELDS) s[f] = new Int32Array(MAX_ENTITIES);
  s['status'] = new Int32Array(MAX_ENTITIES * STATUS_SLOTS * STATUS_STRIDE);
  s['teams'] = new Int32Array(TEAM_COUNT * TEAM_STRIDE);
  s['world'] = new Int32Array(WORLD_SLOTS);
  s['rng'] = new Uint32Array(RNG_WORDS);
  const state = s as unknown as SimState;
  state.world[World.matchSeed] = matchSeed | 0;
  return state;
}

type AnyArray = Float64Array | Int32Array | Uint32Array;

/** Every backing array in a fixed order; snapshot, restore and hashing all follow it. */
export function stateArrays(s: SimState): AnyArray[] {
  return [...F64_FIELDS.map((f) => s[f]), ...I32_FIELDS.map((f) => s[f]), s.teams, s.status, s.world, s.rng];
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
