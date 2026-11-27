import { describe, expect, it } from 'vitest';
import { BODY_LENGTH_PX, FX_DRAW_TWEAKS, applyFxTweak } from './fx-draw-tweaks';

describe('fx draw tweaks (view only)', () => {
  it('pins the table', () => {
    expect(FX_DRAW_TWEAKS.emberBite).toMatchObject({ scale: 1.6, minAlpha: 1, additive: true, forwardPx: BODY_LENGTH_PX });
    expect(FX_DRAW_TWEAKS.cinderSpray).toMatchObject({ scale: 1.5, minAlpha: 1, additive: true });
    expect(FX_DRAW_TWEAKS.abyssFlash).toMatchObject({ scale: 1.8, additive: true });
  });
  it('scales the drawn size, lifts alpha and moves a bite along its heading', () => {
    const b = applyFxTweak('emberBite', 48, 34, 0.5, 0);
    expect(b).toMatchObject({ w: 48 * 1.6, h: 34 * 1.6, alpha: 1, dx: BODY_LENGTH_PX, dy: 0, additive: true });
    expect(applyFxTweak('emberBite', 48, 34, 1, 4).dx).toBe(-BODY_LENGTH_PX);
    expect(applyFxTweak('emberBite', 48, 34, 1, 2).dy).toBe(-BODY_LENGTH_PX);
  });
  it('keeps abyssFlash fade and leaves other sprites untouched', () => {
    expect(applyFxTweak('abyssFlash', 100, 100, 0.4, 0)).toMatchObject({ w: 180, alpha: 0.4, dx: 0 });
    expect(applyFxTweak('fireball', 25, 12, 0.7, 0)).toEqual({ w: 25, h: 12, alpha: 0.7, dx: 0, dy: 0, additive: false });
  });
});
