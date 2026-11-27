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
}

export const FX_DRAW_TWEAKS: Readonly<Record<string, FxDrawTweak>> = {
  cinderSpray: { scale: 1.5, minAlpha: 1, alphaMul: 1, additive: true },
  abyssFlash: { scale: 1.8, minAlpha: 0, alphaMul: 0.9, additive: true },
};

export interface FxDrawResult { readonly w: number; readonly h: number; readonly alpha: number; readonly additive: boolean }

/** The drawn size, alpha and blend for `sprite`; unlisted sprites come back unchanged. */
export function applyFxTweak(sprite: string, w: number, h: number, alpha: number): FxDrawResult {
  const t = FX_DRAW_TWEAKS[sprite];
  if (!t) return { w, h, alpha, additive: false };
  return { w: w * t.scale, h: h * t.scale, alpha: Math.max(alpha, t.minAlpha) * t.alphaMul, additive: t.additive };
}
