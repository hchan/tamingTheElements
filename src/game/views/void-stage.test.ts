import { describe, expect, it } from 'vitest';
import { VOID_BAND_DEPTH, VOID_RING_DEPTH, VOID_WALL_Y, VOID_BAND_TOP, brazierXs, voidHash } from './void-stage';

describe('void stage dressing', () => {
  it('hashes deterministically into [0, 1)', () => {
    for (let i = 0; i < 200; i++) {
      const v = voidHash(i, 7);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      expect(voidHash(i, 7)).toBe(v);
    }
  });
  it('spaces braziers across the whole playfield', () => {
    const xs = brazierXs(2400);
    expect(xs.length).toBeGreaterThan(8);
    for (let i = 1; i < xs.length; i++) expect((xs[i] ?? 0) - (xs[i - 1] ?? 0)).toBeGreaterThan(150);
    expect(Math.max(...xs)).toBeLessThan(2400);
  });
  it('sits between the backdrop and the floor, ring under every hero part', () => {
    expect(VOID_BAND_DEPTH).toBeGreaterThan(-0.95);
    expect(VOID_BAND_DEPTH).toBeLessThan(-0.8);
    expect(VOID_RING_DEPTH).toBeLessThan(0);
    expect(VOID_WALL_Y).toBeGreaterThan(VOID_BAND_TOP);
  });
});
