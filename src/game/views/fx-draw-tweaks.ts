/**
 * View-only in-game readability tweaks for fx sprites the art-director found weak (ideas/brainstorm/fx-ingame-scale-tweaks.md):
 * a larger DRAWN size, full alpha, additive blend and a forward anchor. The sim hit box (w/h) is never touched; the projectile view
 * applies this after it has worked out the drawn size. No Phaser import, so it is unit-testable.
 */
export interface FxDrawTweak {
  /** Multiplier on the drawn width and height. */
  readonly scale: number;
  /** Floor for the drawn alpha (1 = fully opaque). */
  readonly minAlpha: number;
  /** Draw with additive blending (the sprite glows instead of reading as a dark box). */
  readonly additive: boolean;
  /** Shift the art this many px along the attack heading (one body length for a bite at the jaw). */
  readonly forwardPx: number;
}

/** Hero body length (px) used for "one body length ahead" of a bite; an estimate, tune against the real-game capture. */
export const BODY_LENGTH_PX = 40;

export const FX_DRAW_TWEAKS: Readonly<Record<string, FxDrawTweak>> = {
  emberBite: { scale: 1.6, minAlpha: 1, additive: true, forwardPx: BODY_LENGTH_PX },
  // Omni embers already fly along their own heading (rotationForDir), so the spray fans out in the facing direction; no extra shift.
  cinderSpray: { scale: 1.5, minAlpha: 1, additive: true, forwardPx: 0 },
  abyssFlash: { scale: 1.8, minAlpha: 0, additive: true, forwardPx: 0 },
};

const DIR_X = [1, 1, 0, -1, -1, -1, 0, 1] as const;
const DIR_Y = [0, -1, -1, -1, 0, 1, 1, 1] as const;

export interface FxDrawResult { readonly w: number; readonly h: number; readonly alpha: number; readonly dx: number; readonly dy: number; readonly additive: boolean }

/** The drawn size, alpha, offset and blend for `sprite` heading dir8 `dir`; unlisted sprites come back unchanged. */
export function applyFxTweak(sprite: string, w: number, h: number, alpha: number, dir: number): FxDrawResult {
  const t = FX_DRAW_TWEAKS[sprite];
  if (!t) return { w, h, alpha, dx: 0, dy: 0, additive: false };
  const d = dir & 7;
  const len = (d & 1) === 1 ? 0.7071 : 1;
  return { w: w * t.scale, h: h * t.scale, alpha: Math.max(alpha, t.minAlpha), dx: (DIR_X[d] ?? 0) * len * t.forwardPx, dy: (DIR_Y[d] ?? 0) * len * t.forwardPx, additive: t.additive };
}
