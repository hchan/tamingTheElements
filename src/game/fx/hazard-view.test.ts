import { describe, expect, it } from 'vitest';
import { chevronShift, HAZARD_COLORS, HAZARD_LIGHTS, hazardWarnAlpha } from './hazard-view';

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

  it('tide and gust strikes use a pale light that is far brighter than their muted body (r19 contrast) yet stays desaturated', () => {
    const lum = (c: number): number => 0.299 * (c >> 16) + 0.587 * ((c >> 8) & 255) + 0.114 * (c & 255);
    const sat = (c: number): number => { const m = [c >> 16, (c >> 8) & 255, c & 255]; return (Math.max(...m) - Math.min(...m)) / 255; };
    for (const kind of [2, 4]) {
      expect(lum(HAZARD_LIGHTS[kind] ?? 0)).toBeGreaterThan(lum(HAZARD_COLORS[kind] ?? 0) + 60);
      expect(sat(HAZARD_LIGHTS[kind] ?? 0)).toBeLessThan(0.3);
    }
  });
});
