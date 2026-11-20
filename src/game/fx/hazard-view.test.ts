import { describe, expect, it } from 'vitest';
import { earthPulse, columnMarks, dangerGlyphAlpha, WARN_CORE, edgeCues, chevronShift, hazardAnnouncement, hazardLabel, HAZARD_COLORS, HAZARD_LIGHTS, hazardWarnAlpha, impactFlash, dustLook, DUST_TICKS, warnProgress } from './hazard-view';

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

  it('warn glyphs stay bright through the blink dip and the fire core is near-white on every channel', () => {
    expect(dangerGlyphAlpha(0.19)).toBeGreaterThanOrEqual(0.6);
    expect(dangerGlyphAlpha(0.8)).toBeCloseTo(1);
    expect(dangerGlyphAlpha(2)).toBeCloseTo(1);
    const core = WARN_CORE[1] ?? 0;
    for (const ch of [core >> 16, (core >> 8) & 255, core & 255]) expect(ch).toBeGreaterThanOrEqual(0xe0);
  });

  it('the rockfall ground pulse swings 0.5 to 1 about 2 Hz (under 3 flashes a second) and holds steady under reduced motion', () => {
    const v = Array.from({ length: 24 }, (_, t) => earthPulse(t, false));
    expect(Math.min(...v)).toBeCloseTo(0.5);
    expect(Math.max(...v)).toBeCloseTo(1);
    expect(earthPulse(24, false)).toBe(earthPulse(0, false));
    expect(earthPulse(3, false)).toBeCloseTo(0.625); // mid-slope on the way up
    expect(earthPulse(21, false)).toBeCloseTo(0.625); // and on the way down
    for (const t of [0, 5, 9, 17]) expect(earthPulse(t, true)).toBe(0.75);
  });

  it('column marks stay inside the box, wrap within one gap and hold still at shift 0', () => {
    const a = columnMarks(100, 200, 64, 0);
    expect(a).toEqual([100, 164, 228, 292]);
    expect(columnMarks(100, 200, 64, 70)[0]).toBe(106);
    expect(columnMarks(100, 200, 64, -2)[0]).toBe(162);
    expect(columnMarks(100, 200, 0, 5)).toEqual([]);
    for (const y of columnMarks(100, 200, 64, 31)) expect(y >= 100 && y < 300).toBe(true);
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
  it('the countdown runs 0 to 1', () => {
    expect(warnProgress(50, 50)).toBe(0);
    expect(warnProgress(0, 50)).toBe(1);
    expect(warnProgress(99, 50)).toBe(0);
  });
  it('the impact flashes (an outline and burst, not a filled box) for exactly the first 2 ticks of the strike', () => {
    expect([-1, 0, 1, 2, 3].map(impactFlash).map((a) => a > 0)).toEqual([false, true, true, false, false]);
  });

  it('the warning chip names each hazard with whole seconds left, never below 1s', () => {
    expect([1, 2, 3, 4].map((k) => hazardLabel(k, 150))).toEqual(['LAVA 3s', 'TIDE 3s', 'ROCKFALL 3s', 'GUST 3s']);
    expect(hazardLabel(3, 51)).toBe('ROCKFALL 2s');
    expect(hazardLabel(1, 1)).toBe('LAVA 1s');
    expect(hazardLabel(0, 100)).toBe('');
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

  it('rockfall dust grows and fades over DUST_TICKS, holds still when reduced, and is null outside the window', () => {
    expect(dustLook(-1, false)).toBeNull();
    expect(dustLook(DUST_TICKS, false)).toBeNull();
    const a = dustLook(2, false);
    const b = dustLook(12, false);
    expect(a && b && b.t > a.t && b.alpha < a.alpha).toBe(true);
    expect(dustLook(0, false)?.alpha).toBe(1);
    expect(dustLook(3, true)?.t).toBe(1);
    expect(dustLook(20, true)?.alpha).toBeLessThan(dustLook(3, true)?.alpha ?? 0);
  });
});
