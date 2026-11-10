import { DISPLAY_SCALE } from '@core/index';

/**
 * Fraction of the viewport the Phaser canvas container may occupy for a display-size setting.
 * Largest fills the viewport; smaller settings shrink the container. The canvas stays a fixed
 * logical 1280x720 (Scale.FIT), so this changes presentation only, never gameplay.
 */
export function canvasFraction(scale: number): number {
  if (!Number.isFinite(scale) || scale <= 0) return 1;
  const min = DISPLAY_SCALE.Smallest / DISPLAY_SCALE.Largest;
  return Math.min(1, Math.max(min, scale / DISPLAY_SCALE.Largest));
}
