import { describe, expect, it } from 'vitest';
import { DEFAULT_SPARK_STYLE, KO_PUNCH_MS, KO_PUNCH_ZOOM, SPARK_STYLE, koPunchZoom, sparkStyleFor } from './hit-feel';

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
