import { describe, expect, it } from 'vitest';
import { chevronShift, HAZARD_COLORS, hazardWarnAlpha } from './hazard-view';

describe('hazard view helpers', () => {
  it('the warning firms up as the strike nears and blinks unless reduced motion is on', () => {
    expect(hazardWarnAlpha(50, 50, 0, true)).toBeCloseTo(0.35);
    expect(hazardWarnAlpha(1, 50, 0, true)).toBeGreaterThan(hazardWarnAlpha(40, 50, 0, true));
    expect(hazardWarnAlpha(0, 50, 0, true)).toBeCloseTo(0.8);
    const steady = [0, 3, 6, 9, 12].map((t) => hazardWarnAlpha(25, 50, t, true));
    expect(new Set(steady).size).toBe(1);
    expect(hazardWarnAlpha(25, 50, 6, false)).toBeLessThan(hazardWarnAlpha(25, 50, 0, false));
  });

  it('chevrons scroll the hazard way within one gap and hold still under reduced motion', () => {
    expect(chevronShift(10, 1, 72, false)).toBe(20);
    expect(chevronShift(10, -1, 72, false)).toBe(52);
    expect(chevronShift(1000, 1, 72, false)).toBeLessThan(72);
    expect(chevronShift(10, 1, 72, true)).toBe(0);
  });

  it('each element hazard has its own muted colour', () => {
    expect(new Set(HAZARD_COLORS.slice(1)).size).toBe(4);
  });
});
