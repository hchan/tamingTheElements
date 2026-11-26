import { describe, expect, it } from 'vitest';
import {
  PUFF_ALPHA, SPECK_ALPHA, SPECK_BIRTH_SPREAD, SPECK_COLORS, SPECK_COUNT, SPECK_GRAVITY, SPECK_LIFE, SPECK_PALETTE, SPECK_RADIUS, SPECK_RIM,
  SPECK_SIZES, SPECK_THROW, SPORE_PROCEDURAL, SPORE_VIEW_TICKS, hidesSporeSprite, sporeProcedural, sporeSpecks,
} from './spore-specks';

const lum = (c: number): number => ((c >> 16) & 255) * 0.3 + ((c >> 8) & 255) * 0.59 + (c & 255) * 0.11;
const mean = (a: readonly number[]): number => a.reduce((s, v) => s + v, 0) / Math.max(1, a.length);
const all = (): ReturnType<typeof sporeSpecks>[] => Array.from({ length: SPORE_VIEW_TICKS + 1 }, (_, t) => sporeSpecks(0, 0, 0, t, false));

describe('spore specks (round 2)', () => {
  it('has 26 specks and the procedural seam is on', () => {
    expect(SPECK_COUNT).toBe(26);
    expect(SPORE_PROCEDURAL).toBe(false);
    const peak = Math.max(...all().map((f) => f.length));
    expect(peak).toBeLessThanOrEqual(SPECK_COUNT);
    expect(peak).toBeGreaterThanOrEqual(16);
  });
  it('seam: the sprite is hidden only when procedural is on and motion is not reduced', () => {
    expect(hidesSporeSprite('sporeBurst', false, true)).toBe(true);
    expect(hidesSporeSprite('sporeBurst', false, false)).toBe(false);
    expect(hidesSporeSprite('sporeBurst', true, true)).toBe(false);
    expect(hidesSporeSprite('fireBlast', false, true)).toBe(false);
    expect(hidesSporeSprite('sporeBurst', false)).toBe(SPORE_PROCEDURAL);
    expect(sporeProcedural()).toBe(SPORE_PROCEDURAL);
    expect(sporeProcedural(false)).toBe(false); // false: the aura view takes the shipped puff path, the projectile sprite and trail stay
  });
  it('uses the weighted palette (weights sum to 100) with no cream and no yellow-green', () => {
    expect(SPECK_PALETTE.map((p) => p.color)).toEqual([0x5a5a22, 0x8a6a1e, 0x3b2f1a, 0xa58a2c]);
    expect(SPECK_PALETTE.map((p) => p.weight)).toEqual([40, 30, 20, 10]);
    expect(SPECK_PALETTE.reduce((s, p) => s + p.weight, 0)).toBe(100);
    for (const c of SPECK_COLORS) {
      expect(lum(c)).toBeLessThan(140);
      expect((c >> 8) & 255).toBeLessThanOrEqual(((c >> 16) & 255) + 4); // never green-dominant (lime)
      expect(((c >> 16) & 255) - (c & 255)).toBeGreaterThanOrEqual(24);
    }
    expect(SPECK_RIM).toEqual({ color: 0x2a2412, width: 1 });
    const colors = all().flat().map((s) => s.color);
    for (const c of colors) expect(SPECK_COLORS).toContain(c);
    expect(colors.filter((c) => c === 0x5a5a22).length / colors.length).toBeGreaterThan(0.25);
  });
  it('keeps radius 6-14 px with most 7-10, alpha 0.9 at birth and life 30-40 ticks', () => {
    expect(SPECK_RADIUS).toEqual({ min: 6, max: 14 });
    expect(SPECK_SIZES.reduce((s, z) => s + z.share, 0)).toBeCloseTo(1);
    expect(SPECK_ALPHA).toBe(0.9);
    expect(SPECK_LIFE).toEqual({ min: 30, max: 40 });
    expect(SPECK_GRAVITY).toBeCloseTo(0.05);
    const rs = all().flat().map((s) => s.r);
    for (const r of rs) {
      expect(r).toBeGreaterThanOrEqual(SPECK_RADIUS.min);
      expect(r).toBeLessThanOrEqual(SPECK_RADIUS.max);
    }
    expect(rs.filter((r) => r >= 7 && r <= 10).length / rs.length).toBeGreaterThan(0.55);
    expect(Math.max(...all().flat().map((s) => s.a))).toBeLessThanOrEqual(SPECK_ALPHA);
    expect(SPECK_BIRTH_SPREAD + SPECK_LIFE.max).toBe(SPORE_VIEW_TICKS);
    expect(sporeSpecks(0, 0, 0, SPORE_VIEW_TICKS + 1, false)).toHaveLength(0);
  });
  it('holds near full alpha for most of life, then fades to zero', () => {
    expect(Math.max(...sporeSpecks(0, 0, 0, 3, false).map((s) => s.a))).toBeGreaterThan(0.85);
    expect(mean(sporeSpecks(0, 0, 0, 20, false).map((s) => s.a))).toBeGreaterThan(0.6);
    for (const s of sporeSpecks(0, 0, 0, SPORE_VIEW_TICKS - 1, false)) expect(s.a).toBeLessThan(0.5);
  });
  it('throws specks 40-90 px off the flight path with a downward drift', () => {
    expect(SPECK_THROW).toEqual({ min: 40, max: 90 });
    const late = sporeSpecks(0, 0, 0, 36, false);
    expect(late.length).toBeGreaterThan(0);
    expect(mean(late.map((s) => s.y))).toBeGreaterThan(0); // down is +y
  });
  it('is deterministic, mirrors west and is empty before the cast', () => {
    expect(sporeSpecks(10, 20, 0, 9, false)).toEqual(sporeSpecks(10, 20, 0, 9, false));
    expect(mean(sporeSpecks(100, 0, 0, 20, false).map((s) => s.x))).toBeGreaterThan(100);
    expect(mean(sporeSpecks(100, 0, 4, 20, false).map((s) => s.x))).toBeLessThan(100);
    expect(sporeSpecks(0, 0, 0, -1, false)).toHaveLength(0);
  });
  it('reduced motion is one faint puff, the same at any age', () => {
    const a = sporeSpecks(5, 5, 1, 1, true);
    expect(a).toHaveLength(1);
    expect(a[0]?.a).toBe(PUFF_ALPHA);
    expect(a).toEqual(sporeSpecks(5, 5, 1, 30, true));
  });
});
