import { describe, expect, it } from 'vitest';
import { edgeCues, chevronShift, hazardAnnouncement, HAZARD_COLORS, HAZARD_LIGHTS, hazardWarnAlpha, impactFlash, shadowRadius, warnProgress } from './hazard-view';

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

  it('each hazard has a screen-reader warning line, none for no hazard', () => {
    for (const k of [1, 2, 3, 4]) expect(hazardAnnouncement(k)).toMatch(/ (warning|shift)$/);
    expect(hazardAnnouncement(0)).toBe('');
    expect(new Set([1, 2, 3, 4].map(hazardAnnouncement)).size).toBe(4);
  });
});

describe('rockfall and fire telegraph helpers (r21)', () => {
  it('the countdown runs 0 to 1 and the shadow grows with it', () => {
    expect(warnProgress(50, 50)).toBe(0);
    expect(warnProgress(0, 50)).toBe(1);
    expect(warnProgress(99, 50)).toBe(0);
    expect(shadowRadius(0, 88)).toBeCloseTo(22);
    expect(shadowRadius(1, 88)).toBeCloseTo(88);
    expect(shadowRadius(0.5, 88)).toBeGreaterThan(shadowRadius(0.2, 88));
  });
  it('the impact flashes for exactly the first 2 ticks of the strike', () => {
    expect([-1, 0, 1, 2, 3].map(impactFlash).map((a) => a > 0)).toEqual([false, true, true, false, false]);
  });

  it('names the hazard in short screen-reader lines', () => {
    expect([1, 2, 3, 4].map(hazardAnnouncement)).toEqual(['Lava lane warning', 'Tide shift', 'Rockfall warning', 'Gust warning']);
  });

  it('edge cues point at the off-screen part of a box and are empty when it is fully visible or fully away', () => {
    const view = { x: 100, y: 0, width: 800, height: 600 };
    expect(edgeCues(view, { x: 300, y: 100, w: 100, h: 400 })).toEqual([]);
    expect(edgeCues(view, { x: 0, y: 100, w: 99, h: 400 })).toEqual([]);
    expect(edgeCues(view, { x: 40, y: 100, w: 200, h: 400 })).toEqual([{ side: 'left', pos: 300 }]);
    expect(edgeCues(view, { x: 850, y: 100, w: 200, h: 400 })).toEqual([{ side: 'right', pos: 300 }]);
    expect(edgeCues(view, { x: 400, y: 500, w: 100, h: 300 })).toEqual([{ side: 'bottom', pos: 450 }]);
    expect(edgeCues(view, { x: 0, y: 0, w: 2000, h: 600 }).map((c) => c.side)).toEqual(['left', 'right']);
  });
});
