import { describe, expect, it } from 'vitest';
import { lowLifeStrength } from './low-life-vignette';

describe('lowLifeStrength', () => {
  it('is off when healthy, dead or unknown', () => {
    expect(lowLifeStrength(undefined)).toBe(0);
    expect(lowLifeStrength(0)).toBe(0);
    expect(lowLifeStrength(0.31)).toBe(0);
    expect(lowLifeStrength(1)).toBe(0);
  });
  it('ramps from 30 % to full at 10 %', () => {
    expect(lowLifeStrength(0.3)).toBe(0);
    expect(lowLifeStrength(0.2)).toBeCloseTo(0.5);
    expect(lowLifeStrength(0.1)).toBeCloseTo(1);
    expect(lowLifeStrength(0.05)).toBe(1);
  });
});
