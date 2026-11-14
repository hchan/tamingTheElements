import { describe, expect, it } from 'vitest';
import { DEFAULT_SPARK_STYLE, KO_PUNCH_MS, KO_PUNCH_ZOOM, SPARK_STYLE, koPunchZoom, sparkStyleFor, KO_WASH_MS, KO_WASH_PEAK, koWashStrength, RING_MS, ringFrame, ringReach } from './hit-feel';

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
