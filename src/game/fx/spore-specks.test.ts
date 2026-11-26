import { describe, expect, it } from 'vitest';
import { PUFF_ALPHA, SPECK_BIRTH_SPREAD, SPECK_COLORS, SPECK_COUNT, SPECK_LIFE, SPECK_RADIUS, SPECK_SPEED, SPECK_START_R, sporeSpecks } from './spore-specks';
import { SPORE_TICKS } from './umbrel-fx';

const lum = (c: number): number => ((c >> 16) & 255) * 0.3 + ((c >> 8) & 255) * 0.59 + (c & 255) * 0.11;
const mean = (a: readonly number[]): number => a.reduce((s, v) => s + v, 0) / Math.max(1, a.length);

describe('spore specks', () => {
  it('uses 12-20 specks', () => {
    expect(SPECK_COUNT).toBeGreaterThanOrEqual(12);
    expect(SPECK_COUNT).toBeLessThanOrEqual(20);
    const peak = Math.max(...Array.from({ length: SPORE_TICKS + 1 }, (_, t) => sporeSpecks(0, 0, 0, t, false).length));
    expect(peak).toBeLessThanOrEqual(SPECK_COUNT);
    expect(peak).toBeGreaterThanOrEqual(8);
  });
  it('has no cream: every colour is olive/ochre/loam (red above blue by 24, darker than cream)', () => {
    for (const c of SPECK_COLORS) {
      expect(lum(c)).toBeLessThan(140);
      expect(((c >> 16) & 255) - (c & 255)).toBeGreaterThanOrEqual(24);
    }
  });
  it('keeps radius, speed and life in range and finishes inside the cast window', () => {
    expect(SPECK_RADIUS.min).toBeLessThan(SPECK_RADIUS.max);
    expect(SPECK_SPEED.min).toBeGreaterThan(0);
    expect(SPECK_BIRTH_SPREAD + SPECK_LIFE.max).toBeLessThanOrEqual(SPORE_TICKS);
    for (let t = 0; t <= SPORE_TICKS; t++) {
      for (const s of sporeSpecks(0, 0, 0, t, false)) {
        expect(s.r).toBeGreaterThan(SPECK_RADIUS.min * 0.5);
        expect(s.r).toBeLessThanOrEqual(SPECK_RADIUS.max);
        expect(s.a).toBeGreaterThanOrEqual(0);
        expect(SPECK_COLORS).toContain(s.color);
      }
    }
    expect(sporeSpecks(0, 0, 0, SPECK_BIRTH_SPREAD + SPECK_LIFE.max + 1, false)).toHaveLength(0);
  });
  it('throws specks outward and fades them', () => {
    const early = sporeSpecks(0, 0, 0, 6, false);
    const later = sporeSpecks(0, 0, 0, 20, false);
    expect(early.length).toBeGreaterThan(0);
    expect(mean(later.map((s) => s.a))).toBeLessThan(mean(early.map((s) => s.a)));
    expect(Math.max(...later.map((s) => Math.abs(s.y)))).toBeGreaterThan(SPECK_START_R * 0.5);
  });
  it('is deterministic, mirrors west and is empty outside the window', () => {
    expect(sporeSpecks(10, 20, 0, 9, false)).toEqual(sporeSpecks(10, 20, 0, 9, false));
    expect(mean(sporeSpecks(100, 0, 0, 8, false).map((s) => s.x))).toBeGreaterThan(100);
    expect(mean(sporeSpecks(100, 0, 4, 8, false).map((s) => s.x))).toBeLessThan(100);
    expect(sporeSpecks(0, 0, 0, -1, false)).toHaveLength(0);
    expect(sporeSpecks(0, 0, 0, SPORE_TICKS + 1, false)).toHaveLength(0);
  });
  it('reduced motion is one faint puff, the same at any age', () => {
    const a = sporeSpecks(5, 5, 1, 1, true);
    expect(a).toHaveLength(1);
    expect(a[0]?.a).toBe(PUFF_ALPHA);
    expect(a).toEqual(sporeSpecks(5, 5, 1, 30, true));
  });
});
