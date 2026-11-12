/** Pure reduced-motion rules for cosmetic tweens. Nothing here touches the sim. */

/** Cross-fade length used instead of movement or spins when motion is reduced. */
export const REDUCED_FADE_MS = 150;

export interface MotionTween {
  readonly alpha?: number;
  readonly spin?: number;
  readonly x?: number;
  readonly y?: number;
  readonly w?: number;
  readonly h?: number;
}

export interface TweenPlan {
  /** Properties to set at once (no animation). */
  readonly instant: MotionTween;
  /** Properties to animate over `ms`, or null when nothing animates. */
  readonly animated: MotionTween | null;
  readonly ms: number;
}

/**
 * Normal motion animates everything. Reduced motion drops spins, snaps position and size to their end
 * values, and keeps only an alpha cross-fade (at most `REDUCED_FADE_MS`).
 */
export function planTween(to: MotionTween, ms: number, reduced: boolean): TweenPlan {
  if (!reduced) return { instant: {}, animated: to, ms };
  const { alpha, x, y, w, h } = to;
  const geometry: MotionTween = {
    ...(x === undefined ? {} : { x }),
    ...(y === undefined ? {} : { y }),
    ...(w === undefined ? {} : { w }),
    ...(h === undefined ? {} : { h }),
  };
  return {
    instant: geometry,
    animated: alpha === undefined ? null : { alpha },
    ms: Math.min(ms, REDUCED_FADE_MS),
  };
}

export interface ShakeParams {
  readonly durationMs: number;
  readonly intensity: number;
}

/** Screen shake is dropped entirely under reduced motion. */
export function shakeFor(durationMs: number, intensity: number, reduced: boolean): ShakeParams | null {
  return reduced ? null : { durationMs, intensity };
}

/** Classic hit shake scaled by damage: 80 ms at 0.002 for 5 damage (the old fixed shake), growing to 120 ms at 0.006 from 15. */
export function classicShakeFor(amount: number): { readonly durationMs: number; readonly intensity: number } {
  const a = Math.min(15, Math.max(1, Number.isFinite(amount) ? amount : 5));
  return { durationMs: 60 + 4 * a, intensity: Math.round(a * 4) / 10000 };
}
