import { describe, expect, it } from 'vitest';
import { hitRate } from './hit-variety';

describe('hitRate', () => {
  it('lowers the pitch as the hit gets heavier, clamped at 0 and 200 damage', () => {
    expect(hitRate(0, 2)).toBeCloseTo(1.13);
    expect(hitRate(200, 2)).toBeCloseTo(0.83);
    expect(hitRate(100, 0)).toBeLessThan(hitRate(10, 0));
    expect(hitRate(-50, 0)).toBe(hitRate(0, 0));
    expect(hitRate(99999, 0)).toBe(hitRate(200, 0));
    expect(hitRate(undefined, 0)).toBe(hitRate(0, 0));
  });

  it('cycles five distinct offsets for equal hits and repeats after a full cycle', () => {
    const rates = [0, 1, 2, 3, 4].map((i) => hitRate(50, i));
    expect(new Set(rates).size).toBe(5);
    expect(hitRate(50, 5)).toBe(hitRate(50, 0));
  });

  it('stays in an audible band', () => {
    for (let a = 0; a <= 300; a += 25) for (let i = 0; i < 10; i++) expect(hitRate(a, i)).toBeGreaterThan(0.75);
  });
});
