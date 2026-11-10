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
