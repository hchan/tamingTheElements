import { describe, expect, it } from 'vitest';
import {
  PILL_W, SLIM_H, TRAIL_HOLD_MS, chipBar, lifeFill, chipRect, compactLabel, shortName, mirrorX, pillWord, slimBar, slimPortrait, stepTrail, tagPill,
} from './slim-hud';
import { PIP_R, pips } from './round-announcer';

describe('2v2 tag pill clears the round pips (QA r15)', () => {
  it('leaves at least 30 px between the pill and the nearest-out ROUNDS pip, and mirrors for team 1', () => {
    const p = tagPill(0);
    const outer = Math.min(...pips([0, 0]).filter((q) => q.team === 0).map((q) => q.x)) - PIP_R - 4;
    expect(outer - (p.x + p.w)).toBeGreaterThanOrEqual(30);
    const q = tagPill(1);
    expect(q.x).toBe(1280 - p.x - p.w);
  });
});

describe('slim HUD geometry', () => {
  it('keeps everything inside the top SLIM_H px and mirrors team 1 about the centre', () => {
    for (const team of [0, 1]) {
      const b = slimBar(team);
      expect(b.y + b.lineMax / 2).toBeLessThan(SLIM_H);
      for (const i of [0, 1, 2]) {
        const r = chipRect(team, i);
        expect(r.y + r.size).toBeLessThanOrEqual(chipBar(team, i).y);
        // The bench portraits are 68 px and hang under the band into the crowd strip (qa-r5-bench-portraits-small).
        expect(r.size).toBeGreaterThanOrEqual(68);
        expect(r.y).toBeGreaterThan(slimBar(team).y + slimBar(team).lineMax / 2);
      }
    }
    expect(slimBar(0).maxX - slimBar(0).minX).toBe(slimBar(1).maxX - slimBar(1).minX);
    expect(slimBar(0).minX + slimBar(1).maxX).toBe(1280);
    expect(mirrorX(1, 346, 36)).toBe(898);
    expect(chipRect(1, 0).x + 68 + chipRect(0, 0).x).toBe(1280);
  });
  it('leaves a gap between the portrait and the bar, and the right portrait clear of the fullscreen corner', () => {
    expect(slimPortrait(0).x + slimPortrait(0).size).toBeLessThan(slimBar(0).minX);
    expect(slimPortrait(1).x).toBeGreaterThan(slimBar(1).maxX);
  });
  it('lays chips and the tag pill side by side without overlap', () => {
    for (const team of [0, 1]) {
      const xs = [0, 1].map((i) => chipRect(team, i).x);
      expect(Math.abs((xs[1] ?? 0) - (xs[0] ?? 0))).toBeGreaterThanOrEqual(68);
      const pill = tagPill(team);
      const first = chipRect(team, 0).x;
      const apart = team === 0 ? pill.x - (first + 68) : first - (pill.x + PILL_W);
      expect(apart).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('slim HUD words', () => {
  it('shortens the tag word for the pill', () => {
    expect(['TAG READY', 'TAG 2.4s', 'NO TAG'].map(pillWord)).toEqual(['TAG', '2.4s', 'NO TAG']);
  });
  it('writes name and life, and the health word only when hurt', () => {
    const base = { hp: 228, maxHp: 228, restCap: 228, element: 'fire' as const };
    expect(compactLabel('Sindarosa', base)).toContain('SINDAROSA');
    expect(compactLabel('Sindarosa', base)).toContain('Life 228/228');
    expect(compactLabel('Sindarosa', base)).not.toMatch(/HURT|LOW/);
    expect(compactLabel('Sindarosa', { ...base, hp: 20 })).toMatch(/LOW/);
    // The phone's terse form keeps the name and numbers but drops the word "Life".
    expect(compactLabel('Sindarosa', base, false, true)).toContain('SINDAROSA');
    expect(compactLabel('Sindarosa', base, false, true)).toContain(' 228/228');
    expect(compactLabel('Sindarosa', base, false, true)).not.toContain('Life');
    // The bare form also drops "/max" so a long name fits at full size.
    expect(compactLabel('Treenoc', base, false, 'bare')).toBe('TREENOC \u25B2 228');
    expect(compactLabel('Treenoc', base, false, 'min')).toBe('TREENOC ▲ 228');
    expect(compactLabel('Treenoc', { ...base, hp: 20 }, false, 'bare')).toMatch(/^TREENOC .+ 20 LOW$/);
  });
});

describe('shortName', () => {
  it('keeps a name that fits, ellipsises one that does not, drops it under 3 letters', () => {
    expect(shortName('Pax', 8)).toBe('Pax');
    expect(shortName('Sindarosa', 5)).toBe('Sind\u2026');
    expect(shortName('Sindarosa', 2)).toBe('');
  });
});

describe('ghost damage trail', () => {
  it('holds about half a second after a hit, then drains to the current life', () => {
    const t = { v: 100, hold: TRAIL_HOLD_MS };
    for (let ms = 0; ms < TRAIL_HOLD_MS - 20; ms += 10) expect(stepTrail(t, 60, 100, false, 10)).toBe(100);
    let prev = 100;
    for (let i = 0; i < 200; i++) {
      const v = stepTrail(t, 60, 100, false, 16);
      expect(v).toBeLessThanOrEqual(prev);
      expect(v).toBeGreaterThanOrEqual(60);
      prev = v;
    }
    expect(prev).toBe(60);
  });
  it('is frame-rate independent and ignores a stalled frame', () => {
    const a = { v: 100, hold: 0 };
    const b = { v: 100, hold: 0 };
    for (let i = 0; i < 20; i++) stepTrail(a, 0, 100, false, 10);
    for (let i = 0; i < 10; i++) stepTrail(b, 0, 100, false, 20);
    expect(a.v).toBeCloseTo(b.v, 6);
    const c = { v: 100, hold: TRAIL_HOLD_MS };
    stepTrail(c, 50, 100, false, 5000);
    expect(c.hold).toBeGreaterThan(TRAIL_HOLD_MS - 60);
  });
  it('jumps up with a heal, and vanishes without gliding under reduced motion', () => {
    const t = { v: 50, hold: 0 };
    expect(stepTrail(t, 80, 100, false)).toBe(80);
    stepTrail(t, 30, 100, true, 16);
    for (let i = 0; i < 40; i++) stepTrail(t, 30, 100, true, 16);
    expect(t.v).toBe(30);
  });
});

describe('lifeFill', () => {
  it('keeps the element colour while healthy, goes ember when low, and flashes brighter with the pulse', () => {
    expect(lifeFill(0x3366cc, 1)).toBe(0x3366cc);
    expect(lifeFill(0x3366cc, 0.5)).toBe(0x3366cc);
    expect(lifeFill(0x3366cc, 0.2)).not.toBe(lifeFill(0x3366cc, 0.2, 1));
    expect(lifeFill(0x3366cc, 0.2, 1)).toBe(0xe0402e);
    expect(lifeFill(0x3366cc, Number.NaN)).toBe(0x3366cc);
  });
});
