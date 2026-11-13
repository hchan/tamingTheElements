import type Phaser from 'phaser';

/** Red screen-edge warning while the active hero is low (view only; reads the render view, never the sim). */

/** Vignette strength 0..1 for a life fraction: none above 30 %, full at 10 % and below. */
export function lowLifeStrength(fraction: number | undefined): number {
  if (fraction === undefined || fraction <= 0 || fraction > 0.3) return 0;
  return Math.min(1, (0.3 - fraction) / 0.2);
}

/** Fixed vignette strength under reduced motion (no ramp with falling life). */
export const REDUCED_STRENGTH = 0.3;

/** Owns one camera vignette filter: created on first need, disabled (not destroyed) while life is healthy. */
export class LowLifeVignette {
  private filter: { active: boolean; strength: number } | undefined;

  /** `reduced` is read each call, so the setting applies live. Reduced motion shows a steady edge, never one that deepens as life drops. */
  constructor(
    private readonly camera: Phaser.Cameras.Scene2D.Camera,
    private readonly reduced?: () => boolean,
  ) {}

  set(fraction: number | undefined): void {
    const s = lowLifeStrength(fraction);
    if (s === 0 && !this.filter) return;
    this.filter ??= this.camera.filters.external.addVignette(0.5, 0.5, 0.55, 0, 0xc01010) as { active: boolean; strength: number };
    this.filter.active = s > 0;
    this.filter.strength = s > 0 && this.reduced?.() ? REDUCED_STRENGTH : s * 0.6;
  }
}
