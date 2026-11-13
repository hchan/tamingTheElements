import type { Element } from '@core/index';
import { describe, expect, it } from 'vitest';
import { CLEANSE_POOL, CLEANSE_TICKS, CleanseFx, MAX_PARTS, cleanseFade, cleanseParts, elementOfCleanse, parts } from './cleanse-fx';

const box = { x: 100, y: 200, w: 60, h: 80 };
const ELEMENTS: Element[] = ['water', 'fire', 'earth', 'air'];

describe('cleanse-fx', () => {
  it('maps the event element kind to an Element', () => {
    expect([1, 2, 3, 4, 5, 9].map(elementOfCleanse)).toEqual(['fire', 'water', 'earth', 'air', 'void', 'void']);
  });
  it('every element draws something mid-scene, within the pool, and nothing outside its life', () => {
    for (const e of ELEMENTS) {
      const n = cleanseParts(e, box, 20, false, 1);
      expect(n, e).toBeGreaterThan(3);
      expect(n).toBeLessThanOrEqual(MAX_PARTS);
      expect(cleanseParts(e, box, -1, false, 1)).toBe(0);
      expect(cleanseParts(e, box, CLEANSE_TICKS, false, 1)).toBe(0);
    }
    expect(cleanseParts('void', box, 20, false, 1)).toBe(0);
  });
  it('scenes differ per element (not colour alone: the shape mix differs)', () => {
    const shapes = (e: Element): string => {
      const n = cleanseParts(e, box, 20, false, 1);
      return [...new Set(parts.slice(0, n).map((p) => p.shape))].sort().join();
    };
    expect(new Set(ELEMENTS.map(shapes)).size).toBe(4);
  });
  it('is deterministic for the same inputs and varies with the seed', () => {
    const at = (seed: number): string => {
      const n = cleanseParts('fire', box, 15, false, seed);
      return JSON.stringify(parts.slice(0, n));
    };
    expect(at(2)).toBe(at(2));
    expect(at(2)).not.toBe(at(3));
  });
  it('reduced motion paints the same frame at any age (only the fade moves)', () => {
    for (const e of ELEMENTS) {
      cleanseParts(e, box, 8, true, 1);
      const a = parts.slice(0, 3).map((p) => [p.x, p.y]);
      cleanseParts(e, box, 20, true, 1);
      const b = parts.slice(0, 3).map((p) => [p.x, p.y]);
      expect(a).toEqual(b);
    }
    expect(cleanseFade(5, true)).toBe(1);
    expect(cleanseFade(CLEANSE_TICKS - 1, true)).toBeLessThan(1);
  });
  it('fades in and out', () => {
    expect(cleanseFade(0, false)).toBe(0);
    expect(cleanseFade(CLEANSE_TICKS / 2, false)).toBe(1);
    expect(cleanseFade(CLEANSE_TICKS, false)).toBe(0);
  });
});

describe('CleanseFx', () => {
  it('restarts one effect per hero, caps the pool and prunes finished or future ones', () => {
    const f = new CleanseFx();
    f.start(1, 'fire', 10);
    f.start(1, 'fire', 20);
    expect(f.live).toHaveLength(1);
    expect(f.live[0]?.born).toBe(20);
    for (let i = 2; i < 2 + CLEANSE_POOL + 2; i++) f.start(i, 'air', 20);
    expect(f.live).toHaveLength(CLEANSE_POOL);
    f.prune(20 + CLEANSE_TICKS);
    expect(f.live).toHaveLength(0);
    f.start(1, 'water', 100);
    f.prune(50);
    expect(f.live).toHaveLength(0);
  });
});
