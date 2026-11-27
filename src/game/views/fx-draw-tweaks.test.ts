import { describe, expect, it } from 'vitest';
import { FX_DRAW_TWEAKS, applyFxTweak } from './fx-draw-tweaks';

describe('fx draw tweaks (view only)', () => {
  it('pins the table; emberBite is parked and stays as shipped', () => {
    expect(FX_DRAW_TWEAKS.cinderSpray).toMatchObject({ scale: 1.5, minAlpha: 1, alphaMul: 1, additive: true });
    expect(FX_DRAW_TWEAKS.abyssFlash).toMatchObject({ scale: 1.8, alphaMul: 0.9, additive: true });
    expect(FX_DRAW_TWEAKS.emberBite).toBeUndefined();
  });
  it('scales the drawn size and lifts the spray to full alpha', () => {
    expect(applyFxTweak('cinderSpray', 20, 20, 0.5)).toEqual({ w: 30, h: 30, alpha: 1, additive: true });
  });
  it('keeps abyssFlash fade (times 0.9) and leaves other sprites untouched', () => {
    expect(applyFxTweak('abyssFlash', 100, 100, 0.4)).toMatchObject({ w: 180, h: 180, alpha: 0.4 * 0.9 });
    expect(applyFxTweak('emberBite', 48, 34, 0.7)).toEqual({ w: 48, h: 34, alpha: 0.7, additive: false });
  });
});
