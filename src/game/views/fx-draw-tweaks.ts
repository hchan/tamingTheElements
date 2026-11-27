/**
 * View-only in-game readability tweaks for fx sprites the art-director found weak (ideas/brainstorm/fx-ingame-scale-tweaks.md):
 * a larger DRAWN size, full alpha and additive blend. The sim hit box (w/h) is never touched; the projectile view applies this after
 * it has worked out the drawn size. No Phaser import, so it is unit-testable.
 */
export interface FxDrawTweak {
  /** Multiplier on the drawn width and height. */
  readonly scale: number;
  /** Floor for the drawn alpha (1 = fully opaque). */
  readonly minAlpha: number;
  /** Multiplier applied after the floor (abyssFlash 0.9 keeps some teal in the core). */
  readonly alphaMul: number;
  /** Draw with additive blending (the sprite glows instead of reading as a dark box). */
  readonly additive: boolean;
  /** Optional tint multiplied into the art (pale teal lifts a dark-teal sprite off its own caster). */
  readonly tint?: number;
  /** Optional flat-colour silhouette drawn additively behind the art (a dark sprite cannot be lightened by tint or additive blend). */
  /** Draw depth override: sprites that spawn inside the caster's body hide under the fighter at the default depth 0. */
  readonly depth?: number;
  readonly haloFill?: number;
  readonly haloAlpha?: number;
  readonly haloScale?: number;
}

export const FX_DRAW_TWEAKS: Readonly<Record<string, FxDrawTweak>> = {
  cinderSpray: { scale: 1.5, minAlpha: 1, alphaMul: 1, additive: true },
  abyssFlash: { scale: 1.8, minAlpha: 0, alphaMul: 0.9, additive: true },
  // The 8-frame loop is a dark-teal worm that starts inside Abyssor's teal body. Additive/tint on dark art shows nothing (captured), so
  // it stays a normal-blend 1.5x worm and gets a pale-teal flat silhouette halo that separates it from the body and the floor.
  abyssalPull: { scale: 1.5, minAlpha: 0, alphaMul: 0.95, additive: false, haloFill: 0xbff4f0, haloAlpha: 0.85, haloScale: 1.35, depth: 400 },
};

/** Abyssal Pull procedural tendril: it starts this many px from the caster (was 8) so it does not pile onto the sprite/body. */
export const PULL_TENDRIL_START_PX = 44;

export interface FxDrawResult { readonly w: number; readonly h: number; readonly alpha: number; readonly additive: boolean }

/** The drawn size, alpha and blend for `sprite`; unlisted sprites come back unchanged. */
export function applyFxTweak(sprite: string, w: number, h: number, alpha: number): FxDrawResult {
  const t = FX_DRAW_TWEAKS[sprite];
  if (!t) return { w, h, alpha, additive: false };
  return { w: w * t.scale, h: h * t.scale, alpha: Math.max(alpha, t.minAlpha) * t.alphaMul, additive: t.additive };
}
