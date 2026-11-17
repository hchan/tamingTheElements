/**
 * View only: how strongly the Fire Blast's trail puffs and end-of-flight burst read (FUN-DESIGN 2.27). The sim already says how
 * faded the blast is (`RenderProjectile.alphaPm`, 350 to 1000, from its remaining damage), so the fx follow that same number:
 * full for the first 0.4 s, down to the 45% damage floor by 1.5 s. Non-blast projectiles report 1000 and stay at full strength.
 */
export const FADE_FLOOR = 0.35;

/** Fx strength in [FADE_FLOOR, 1] from the sim's alpha in per mille (undefined = not a fading projectile = 1). */
export function fireBlastFxStrength(alphaPm: number | undefined): number {
  if (alphaPm === undefined || !Number.isFinite(alphaPm)) return 1;
  return Math.min(1, Math.max(FADE_FLOOR, alphaPm / 1000));
}

/** Trail puff look at strength `s`: opacity and size multipliers (a weak blast leaves fainter, smaller puffs). */
export function trailFade(s: number): { alpha: number; size: number } {
  return { alpha: s, size: 0.6 + 0.4 * s };
}

/** Impact burst look at strength `s`: mote-count, size and opacity multipliers (a weak blast ends in a smaller, dimmer burst). */
export function impactFade(s: number): { count: number; size: number; alpha: number } {
  return { count: 0.4 + 0.6 * s, size: 0.6 + 0.4 * s, alpha: s };
}
