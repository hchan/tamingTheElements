import { describe, expect, it } from 'vitest';
import { DISPLAY_SCALE } from '@core/index';
import { canvasFraction } from './display-scale';

describe('canvasFraction', () => {
  it('is 1 at Largest and grows monotonically with the setting', () => {
    expect(canvasFraction(DISPLAY_SCALE.Largest)).toBe(1);
    const f = Object.values(DISPLAY_SCALE).map(canvasFraction);
    expect([...f].sort((a, b) => a - b)).toEqual(f);
    expect(f[0]).toBeCloseTo(0.625);
  });
  it('clamps and falls back to 1 for invalid input', () => {
    expect(canvasFraction(9)).toBe(1);
    expect(canvasFraction(0.1)).toBeCloseTo(0.625);
    expect(canvasFraction(Number.NaN)).toBe(1);
  });
});
