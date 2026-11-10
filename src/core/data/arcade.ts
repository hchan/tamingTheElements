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
