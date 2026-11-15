import { describe, expect, it } from 'vitest';
import { CHARACTERS } from '@core/index';
import { SHOWCASE_HEROES, SIZE_SCALE, pickShowcase, type SlotKind } from './showcase-data';

const GROUND3: SlotKind[] = ['ground', 'ground', 'floater'];

describe('showcase data', () => {
  it('covers every playable hero with the core element', () => {
    const all: readonly { element: string; sprite: string }[] = CHARACTERS;
    for (const s of SHOWCASE_HEROES) {
      const c = all.find((x) => x.sprite === s.sprite);
      expect(c, s.sprite).toBeDefined();
      expect(s.element).toBe(c?.element);
    }
    expect(SHOWCASE_HEROES).toHaveLength(13);
  });
  it('Wispera is the smallest and dragons are the largest', () => {
    const scale = (sprite: string): number => SIZE_SCALE[SHOWCASE_HEROES.find((x) => x.sprite === sprite)?.size ?? 'large'];
    expect(Math.min(...SHOWCASE_HEROES.map((x) => SIZE_SCALE[x.size]))).toBe(scale('wispera'));
    for (const d of ['sindarosa', 'curomo', 'fiara']) expect(scale(d)).toBe(Math.max(...Object.values(SIZE_SCALE)));
  });
});

describe('pickShowcase', () => {
  it('is deterministic per seed', () => {
    expect(pickShowcase(7, GROUND3)).toEqual(pickShowcase(7, GROUND3));
  });
  it('never repeats a hero or an element, has at most one dragon, and only floaters hold Wispera', () => {
    for (let seed = 0; seed < 1000; seed++) {
      const p = pickShowcase(seed, GROUND3);
      expect(new Set(p.map((x) => x.hero.sprite)).size).toBe(3);
      expect(new Set(p.map((x) => x.hero.element)).size).toBe(3);
      expect(p.filter((x) => x.hero.size === 'dragon').length).toBeLessThanOrEqual(1);
      for (const x of p) if (x.hero.sprite === 'wispera') expect(x.slot).toBe('floater');
      expect(p[2]?.hero.size).not.toBe('dragon');
    }
  });
  it('reaches all 13 heroes over seeds 0 to 999', () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 1000; seed++) for (const x of pickShowcase(seed, GROUND3)) seen.add(x.hero.sprite);
    expect(seen.size).toBe(13);
  });
  it('points right-facing heroes toward the buttons', () => {
    for (let seed = 0; seed < 200; seed++) {
      const [l, r] = pickShowcase(seed, ['ground', 'ground']);
      if (l?.hero.facing === 'right') expect(l.flip).toBe(false);
      if (r?.hero.facing === 'right') expect(r.flip).toBe(true);
    }
  });
});
