/**
 * Arcade ruleset tuning (docs/FUN-DESIGN.md sections 2 and 2.13). Skeleton: each Arcade work package adds its table
 * here as starting values, tuned by the fun metrics. Sim data: changing a value bumps SIM_VERSION. Classic never reads
 * this file.
 */

/** Hit strength tier, the index into every per-strength table (hit-stop, stun, knockback). */
export const HitStrength = { light: 0, medium: 1, heavy: 2, super: 3 } as const;
export type HitStrengthValue = (typeof HitStrength)[keyof typeof HitStrength];

/** One value per HitStrength tier, in tier order. */
export type PerStrength = readonly [light: number, medium: number, heavy: number, superHit: number];

/** Hit-stop length in ticks by strength (FUN-DESIGN 2.2): light 4, medium 6, heavy 8, super hit 10. */
export const HIT_STOP_TICKS: PerStrength = [4, 6, 8, 10];
/** Hit-stop of a parry (WP-arcade-guard-parry) and of a KO (a hit that empties the victim's HP), in ticks. */
export const PARRY_HIT_STOP_TICKS = 10;
export const KO_HIT_STOP_TICKS = 30;

/** `hitStop.cause` payload values (FUN-DESIGN 2.1 event table). */
export const HitStopCause = { hit: 0, parry: 1, super: 2, ko: 3 } as const;

/** Strength from the base damage at level 0: light under 15, medium 15 to 29, heavy 30 or more. */
export const MEDIUM_MIN_DAMAGE = 15;
export const HEAVY_MIN_DAMAGE = 30;

/**
 * Per-ability strength overrides (by ability slug), applied instead of the damage rule and the melee tier bump.
 * Hurricane hits every 25 ticks for a damage that halves each hit, so its hits stay light.
 */
export const HIT_STRENGTH_OVERRIDE: Readonly<Partial<Record<string, HitStrengthValue>>> = {
  hurricane: HitStrength.light,
};

/**
 * Strength tier of an ability's hit: the damage rule, plus one tier for melee (capped at heavy, since only supers
 * are strength 3), unless HIT_STRENGTH_OVERRIDE names the ability.
 */
export function hitStrengthFor(slug: string, baseDamage: number, melee: boolean): HitStrengthValue {
  const forced = HIT_STRENGTH_OVERRIDE[slug];
  if (forced !== undefined) return forced;
  const tier = baseDamage >= HEAVY_MIN_DAMAGE ? 2 : baseDamage >= MEDIUM_MIN_DAMAGE ? 1 : 0;
  return (melee && tier < 2 ? tier + 1 : tier) as HitStrengthValue;
}

/**
 * Hit-stun in game ticks by strength (FUN-DESIGN 2.3): light 12, medium 16, heavy 22, super 26. Each hit taken while
 * already stunned (`juggle`) takes JUGGLE_STUN_STEP off, never below MIN_HIT_STUN_TICKS.
 */
export const HIT_STUN_TICKS: PerStrength = [12, 16, 22, 26];
export const JUGGLE_STUN_STEP = 2;
export const MIN_HIT_STUN_TICKS = 6;
/** At `juggle >= JUGGLE_LIMIT` the next hit deals damage but no stun and the victim recovers. */
export const JUGGLE_LIMIT = 5;
/** A combo's stun chain never exceeds this many game ticks (3 s): the hit that would pass it ends the stun instead. */
export const COMBO_STUN_CAP_TICKS = 150;
/** Invulnerability after either cap ends a combo (`recovered` reason 1 or 2), so a capped combo cannot restart at once. */
export const RECOVERY_INVULN_TICKS = 20;
/** Tornado and Entangling Vines stun (heavy, obeying the caps) instead of the Classic 150-tick freeze. */
export const FREEZE_STUN_TICKS = 60;
export const HIT_STUN_OVERRIDE: Readonly<Partial<Record<string, number>>> = {
  tornado: FREEZE_STUN_TICKS,
  'entangling-vines': FREEZE_STUN_TICKS,
};

/** Base hit-stun of an ability's hit: the override, else the strength table. */
export function hitStunFor(slug: string, strength: HitStrengthValue): number {
  return HIT_STUN_OVERRIDE[slug] ?? HIT_STUN_TICKS[strength];
}

/** `recovered.reason` payload values (FUN-DESIGN 2.1 event table). */
export const RecoveredReason = { stunEnded: 0, juggleCap: 1, stunCap: 2 } as const;

/**
 * Knockback start speed in Q4 (1/16 px per tick) by strength: light 96 (6 px per tick), medium 144, heavy 224, super
 * 256. It decays by KNOCKBACK_DECAY_Q4 (1 px per tick) every game tick, so light travels 21 px, medium 45, heavy 105.
 */
export const KNOCKBACK_Q4: PerStrength = [96, 144, 224, 256];
export const KNOCKBACK_DECAY_Q4 = 16;
export const Q4_ONE = 16;
