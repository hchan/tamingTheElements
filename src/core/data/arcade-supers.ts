import { SUPER_ACTIVE_TICKS, SUPER_BAND_PX, SUPER_ELEMENTAL_BURST, SUPER_HIT_DAMAGE, SUPER_HIT_EVERY } from './arcade';

/**
 * The four Arcade super archetypes and their race variants (FUN-DESIGN 2.5, WP-arcade-supers). Pure data: the shapes run
 * in `sim/systems/arcade/super.ts`. A race without an entry (the Dummy, the Eternal Void) keeps the generic Elemental
 * Burst, which is the Inferno Beam shape with the base numbers.
 */
export const SuperShape = { beam: 0, vortex: 1, quake: 2, tide: 3 } as const;
export type SuperShapeValue = (typeof SuperShape)[keyof typeof SuperShape];

export interface SuperSpec {
  /** `superStarted.superId` (0 is the generic Elemental Burst). */
  readonly id: number;
  readonly name: string;
  readonly shape: SuperShapeValue;
  /** Game ticks the super stays live after the freeze (the tidal wave ends when spent, this is its cap floor). */
  readonly active: number;
  /** Ticks between hits (beam, vortex) or between rings (quake). */
  readonly every: number;
  readonly damage: number;
  /** Beam: band px across. Vortex: box side. Quake: first ring side. Tide: wall width. */
  readonly size: number;
  /** Quake: ring size scale in pm (1000 = 160/320/480). */
  readonly scalePm: number;
  /** Share of the damage dealt that heals the caster, in pm (Phoenix Rise 100, Siren Gale 150). */
  readonly drainPm: number;
  /** Caster speed bonus and its ticks, granted when the super ends (Crimson Tide). */
  readonly speedBonus: number;
  readonly speedTicks: number;
  /** Caster translucent ticks after the super (Phantom Squall). */
  readonly translucentTicks: number;
  /** Caster armour (50%) ticks after the super (Mountain Breaker). */
  readonly armourTicks: number;
  /** Extra stun ticks on the last ring or the wall hit (Overgrowth root, Glacier Crash freeze), counted as stun. */
  readonly rootTicks: number;
  /** Icicles fired during a tidal wave (Hailstorm). */
  readonly icicles: number;
}

export const SUPER_VORTEX_BOX_PX = 480;
export const SUPER_VORTEX_ACTIVE_TICKS = 36;
export const SUPER_VORTEX_DAMAGE = 27;
export const SUPER_QUAKE_RING_PX: readonly number[] = [160, 320, 480];
export const SUPER_QUAKE_RING_EVERY = 10;
export const SUPER_QUAKE_DAMAGE = 60;
export const SUPER_TIDE_WIDTH_PX = 120;
export const SUPER_TIDE_SPEED_PX = 12;
export const SUPER_TIDE_DAMAGE = 150;
/** The slow after a tidal hit: half the victim's speed for this many game ticks. */
export const SUPER_TIDE_SLOW_TICKS = 40;
/** Hailstorm fires an icicle every this many ticks, fanned around the facing by these dir8 offsets. */
export const SUPER_ICICLE_EVERY = 4;
export const SUPER_ICICLE_FAN: readonly number[] = [0, 1, 7, 2, 6, 0];
export const SUPER_ARMOUR_PCT = 50;

const NONE = { scalePm: 1000, drainPm: 0, speedBonus: 0, speedTicks: 0, translucentTicks: 0, armourTicks: 0, rootTicks: 0, icicles: 0 };
const BEAM = { shape: SuperShape.beam, active: SUPER_ACTIVE_TICKS, every: SUPER_HIT_EVERY, damage: SUPER_HIT_DAMAGE, size: SUPER_BAND_PX, ...NONE };
const VORTEX = { shape: SuperShape.vortex, active: SUPER_VORTEX_ACTIVE_TICKS, every: SUPER_HIT_EVERY, damage: SUPER_VORTEX_DAMAGE, size: SUPER_VORTEX_BOX_PX, ...NONE };
const QUAKE = { shape: SuperShape.quake, active: 30, every: SUPER_QUAKE_RING_EVERY, damage: SUPER_QUAKE_DAMAGE, size: 160, ...NONE };
const TIDE = { shape: SuperShape.tide, active: 0, every: 1, damage: SUPER_TIDE_DAMAGE, size: SUPER_TIDE_WIDTH_PX, ...NONE };

/** The generic Elemental Burst (also the fallback). */
export const SUPER_BURST: SuperSpec = { id: SUPER_ELEMENTAL_BURST, name: 'ELEMENTAL BURST', ...BEAM };

/** Race slug -> its super. */
export const RACE_SUPERS: Readonly<Record<string, SuperSpec>> = {
  sindarosa: { id: 1, name: 'HELLFIRE LANCE', ...BEAM, size: 200 },
  lavax: { id: 2, name: 'CRIMSON TIDE', ...BEAM, speedBonus: 2, speedTicks: 150 },
  fiara: { id: 3, name: 'PHOENIX RISE', ...BEAM, drainPm: 35 },
  cyclonius: { id: 4, name: 'EYE OF THE STORM', ...VORTEX },
  wispera: { id: 5, name: 'SIREN GALE', ...VORTEX, drainPm: 50 },
  echo: { id: 6, name: 'PHANTOM SQUALL', ...VORTEX, translucentTicks: 60 },
  rokcore: { id: 7, name: 'MOUNTAIN BREAKER', ...QUAKE, armourTicks: 100 },
  pax: { id: 8, name: 'TITAN SLAM', ...QUAKE, scalePm: 1250 },
  treenoc: { id: 9, name: 'OVERGROWTH', ...QUAKE, rootTicks: 40 },
  curomo: { id: 10, name: 'GLACIER CRASH', ...TIDE, rootTicks: 30 },
  morblass: { id: 11, name: 'HAILSTORM', ...TIDE, icicles: 6 },
  ishimi: { id: 12, name: 'SLIME TSUNAMI', ...TIDE, size: 180 },
};

/** Every super spec by `superId` (index = id). */
export const SUPER_SPECS: readonly SuperSpec[] = [SUPER_BURST, ...Object.values(RACE_SUPERS)].sort((a, b) => a.id - b.id);

/** Super name by `superStarted.superId`, for the view. */
export const SUPER_NAMES: readonly string[] = SUPER_SPECS.map((d) => d.name);

/** The super a race slug casts. */
export function superOf(slug: string): SuperSpec {
  return RACE_SUPERS[slug] ?? SUPER_BURST;
}
