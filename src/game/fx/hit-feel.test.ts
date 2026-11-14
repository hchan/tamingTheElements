import { describe, expect, it } from 'vitest';
import { DEFAULT_SPARK_STYLE, KO_PUNCH_MS, KO_PUNCH_ZOOM, SPARK_STYLE, koPunchZoom, sparkStyleFor, KO_WASH_MS, KO_WASH_PEAK, koWashStrength, RING_MS, ringFrame, ringReach, SUPER_FLASH_MS, SUPER_FLASH_PEAK, SUPER_FRACTION_FALLBACK, SUPER_NUMBER_MS, lifeFraction, superFlashAlpha, superNumberFrame, superNumberSize } from './hit-feel';

describe('sparkStyleFor', () => {
  it('has a distinct style per element and a default', () => {
    expect(sparkStyleFor('fire').drift).toBeLessThan(0);
    expect(sparkStyleFor('water').drift).toBeGreaterThan(0);
    expect(sparkStyleFor('air').reach).toBeGreaterThan(sparkStyleFor('earth').reach);
    expect(sparkStyleFor(undefined)).toBe(DEFAULT_SPARK_STYLE);
    for (const s of Object.values(SPARK_STYLE)) expect(s.lifeMs).toBeLessThanOrEqual(400);
  });
});

describe('koPunchZoom', () => {
  it('is 1 outside the window, peaks mid-way, and never zooms under reduced motion', () => {
    expect(koPunchZoom(0, false)).toBe(1);
    expect(koPunchZoom(KO_PUNCH_MS, false)).toBe(1);
    expect(koPunchZoom(Number.NaN, false)).toBe(1);
    expect(koPunchZoom(KO_PUNCH_MS / 2, false)).toBeCloseTo(KO_PUNCH_ZOOM, 6);
    expect(koPunchZoom(KO_PUNCH_MS / 2, true)).toBe(1);
  });
});

describe('koWashStrength', () => {
  it('is off outside the window and when reduced, drains fast to the peak, then eases back', () => {
    expect(koWashStrength(0, false)).toBe(0);
    expect(koWashStrength(KO_WASH_MS, false)).toBe(0);
    expect(koWashStrength(Number.NaN, false)).toBe(0);
    expect(koWashStrength(300, true)).toBe(0);
    expect(koWashStrength(120, false)).toBeCloseTo(KO_WASH_PEAK, 6);
    expect(koWashStrength(500, false)).toBeLessThan(KO_WASH_PEAK);
    expect(koWashStrength(500, false)).toBeGreaterThan(koWashStrength(900, false));
  });
});

describe('ringFrame', () => {
  it('grows and fades over RING_MS, then ends; a KO ring reaches further than a heavy one', () => {
    expect(ringFrame(-1, 2)).toBeNull();
    expect(ringFrame(RING_MS, 2)).toBeNull();
    const a = ringFrame(100, 2);
    const b = ringFrame(300, 2);
    expect(a && b && b.radius > a.radius && b.alpha < a.alpha && b.width < a.width).toBe(true);
    expect(ringReach(4)).toBeGreaterThan(ringReach(3));
    expect(ringReach(3)).toBeGreaterThan(ringReach(2));
  });
});

describe('super hit impact rules', () => {
  it('lifeFraction clamps and falls back without a usable max', () => {
    expect(lifeFraction(120, 400)).toBeCloseTo(0.3, 6);
    expect(lifeFraction(900, 400)).toBe(1);
    expect(lifeFraction(-5, 400)).toBe(0);
    expect(lifeFraction(120, undefined)).toBe(SUPER_FRACTION_FALLBACK);
    expect(lifeFraction(120, 0)).toBe(SUPER_FRACTION_FALLBACK);
    expect(lifeFraction(Number.NaN, 400)).toBe(SUPER_FRACTION_FALLBACK);
  });

  it('superNumberSize grows with the life share and caps', () => {
    expect(superNumberSize(0)).toBe(44);
    expect(superNumberSize(0.15)).toBe(68);
    expect(superNumberSize(0.3)).toBe(92);
    expect(superNumberSize(0.9)).toBe(92);
    expect(superNumberSize(Number.NaN)).toBe(44);
  });

  it('superNumberFrame pops, rises and fades; reduced motion holds still; null once done', () => {
    expect(superNumberFrame(-1, false)).toBeNull();
    expect(superNumberFrame(SUPER_NUMBER_MS, false)).toBeNull();
    expect(superNumberFrame(70, false)?.scale).toBeGreaterThan(1.3);
    expect(superNumberFrame(400, false)?.scale).toBe(1);
    const a = superNumberFrame(300, false);
    const b = superNumberFrame(800, false);
    expect(a && b && b.rise > a.rise && b.alpha < a.alpha).toBe(true);
    const r = superNumberFrame(300, true);
    expect(r).toEqual({ scale: 1, rise: 0, alpha: 1 });
    expect(superNumberFrame(800, true)?.rise).toBe(0);
  });

  it('superFlashAlpha peaks at once and ends within SUPER_FLASH_MS', () => {
    expect(superFlashAlpha(0)).toBe(SUPER_FLASH_PEAK);
    expect(superFlashAlpha(SUPER_FLASH_MS / 2)).toBeCloseTo(SUPER_FLASH_PEAK / 2, 6);
    expect(superFlashAlpha(SUPER_FLASH_MS)).toBe(0);
    expect(superFlashAlpha(-1)).toBe(0);
  });
});
