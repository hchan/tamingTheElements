import { describe, expect, it } from 'vitest';
import { TILE_COLUMNS, TILE_WEIGHTS, tileGrid } from './terrain-tiles';

const COLS = 40;
const ROWS = 23;

describe('tileGrid', () => {
  it('is deterministic for the same stage and seed', () => {
    expect(tileGrid(1, 12345, COLS, ROWS)).toEqual(tileGrid(1, 12345, COLS, ROWS));
  });

  it('has cols*rows cells, every index in range', () => {
    for (let stage = 1; stage <= 4; stage++) {
      const g = tileGrid(stage, 7, COLS, ROWS);
      expect(g).toHaveLength(COLS * ROWS);
      expect(g.every((v) => Number.isInteger(v) && v >= 0 && v < TILE_COLUMNS)).toBe(true);
    }
  });

  it('is point-symmetric about the centre (even and odd sizes)', () => {
    for (const [c, r] of [[COLS, ROWS], [7, 5], [1, 1]] as const) {
      const g = tileGrid(2, 99, c, r);
      for (let i = 0; i < g.length; i++) expect(g[i]).toBe(g[g.length - 1 - i]);
    }
  });

  it('differs between seeds and between stages', () => {
    expect(tileGrid(1, 1, COLS, ROWS)).not.toEqual(tileGrid(1, 2, COLS, ROWS));
    expect(tileGrid(1, 1, COLS, ROWS)).not.toEqual(tileGrid(2, 1, COLS, ROWS));
  });

  it('is mostly plain floor with sparse decoration', () => {
    const g = tileGrid(3, 5, COLS, ROWS);
    const decor = g.filter((v) => v >= 4).length;
    const expected = ((TILE_WEIGHTS[4] + TILE_WEIGHTS[5] + TILE_WEIGHTS[6] + TILE_WEIGHTS[7]) / 100) * g.length;
    expect(decor).toBeGreaterThan(0);
    expect(decor).toBeLessThan(expected * 3);
    expect(g.filter((v) => v === 0).length).toBeGreaterThan(g.length * 0.3);
  });

  it('is pinned: a fixed seed gives a fixed prefix (same on every engine)', () => {
    expect(tileGrid(4, 1, 10, 2).join('')).toMatchInlineSnapshot(`"10201021033012010201"`);
  });
});
