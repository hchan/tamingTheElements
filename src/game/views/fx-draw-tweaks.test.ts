import { describe, expect, it } from 'vitest';
import { abyssalPull } from '../fx/hyalia-zephra-abyssor-fx';
import { FORGE_GORE_LOOK, FX_DRAW_TWEAKS, PULL_TENDRIL_START_PX, applyFxTweak, forgeGoreLook } from './fx-draw-tweaks';

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

  it('abyssalPull sprite is drawn 1.5x, lighter, additive and tinted', () => {
    expect(FX_DRAW_TWEAKS.abyssalPull).toMatchObject({ scale: 1.5, alphaMul: 0.9, additive: true, tint: 0xbff4f0 });
    expect(applyFxTweak('abyssalPull', 44, 44, 1)).toEqual({ w: 66, h: 66, alpha: 0.9, additive: true });
  });
  it('abyssalPull tendril starts away from the caster, tip unchanged', () => {
    const t = abyssalPull(0, 0, 0, 10, false);
    expect(t?.tendril[0]).toBeGreaterThanOrEqual(PULL_TENDRIL_START_PX);
    expect(abyssalPull(0, 0, 4, 10, false)?.tendril[0]).toBeLessThanOrEqual(-PULL_TENDRIL_START_PX);
    expect(t?.tip.x).toBe(abyssalPull(0, 0, 0, 10, false)?.tip.x);
  });
  it('forgeGore turns the bulge-up arc to the heading, 20 px ahead, drawn at its own aspect', () => {
    const e = forgeGoreLook(0);
    expect(e).toMatchObject({ angle: 90, dx: FORGE_GORE_LOOK.forwardPx, dy: 0 });
    expect(e.w / e.h).toBeCloseTo(80 / 60);
    expect(e.w).toBeCloseTo(80 * 0.85);
    expect(forgeGoreLook(4)).toMatchObject({ angle: 270, dx: -20 });
    expect(forgeGoreLook(2)).toMatchObject({ angle: 0, dy: -20 });
    expect(forgeGoreLook(6)).toMatchObject({ angle: 180, dy: 20 });
  });
});
