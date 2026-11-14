import { describe, expect, it } from 'vitest';
import { SHAFTS, SHAFT_ALPHA, shaftAlpha, shaftX } from './earth-light';

describe('earth-light helpers', () => {
  it('spreads shafts left to right inside the width', () => {
    const xs = Array.from({ length: SHAFTS }, (_, i) => shaftX(i, 1000));
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...xs)).toBeLessThanOrEqual(1000);
  });
  it('breathes within bounds, and is fixed and lower when motion is reduced', () => {
    for (let ms = 0; ms < 20000; ms += 250) {
      const a = shaftAlpha(2, ms, false);
      expect(a).toBeGreaterThan(0);
      expect(a).toBeLessThanOrEqual(SHAFT_ALPHA);
    }
    expect(shaftAlpha(2, 0, true)).toBe(SHAFT_ALPHA * 0.75);
    expect(shaftAlpha(2, 9999, true)).toBe(SHAFT_ALPHA * 0.75);
  });
});
