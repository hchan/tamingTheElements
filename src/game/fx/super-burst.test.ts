import { describe, expect, it } from 'vitest';
import type { Element } from '@core/index';
import { BURST_COLOR, BURST_SHAPE, BURST_TICKS, burstAlpha, superBurst } from './super-burst';

const ELEMENTS: Element[] = ['fire', 'water', 'air', 'earth', 'void'];

describe('super burst', () => {
  it('each element has its own shape, so colour is never the only cue', () => {
    expect(new Set(ELEMENTS.map((e) => BURST_SHAPE[e])).size).toBe(ELEMENTS.length);
    expect(new Set(ELEMENTS.map((e) => BURST_COLOR[e])).size).toBe(ELEMENTS.length);
  });
  it('draws even coordinate counts for every element and ends after BURST_TICKS', () => {
    for (const e of ELEMENTS) {
      const b = superBurst(e, 500, 300, 5, false);
      expect(b?.paths.length).toBeGreaterThan(0);
      for (const p of b?.paths ?? []) expect(p.pts.length % 2).toBe(0);
      expect(superBurst(e, 500, 300, BURST_TICKS + 1, false)).toBeUndefined();
    }
  });
  it('grows with age; reduced motion holds the shape still but still fades', () => {
    for (const e of ELEMENTS) {
      expect(superBurst(e, 0, 0, 2, false)).not.toEqual(superBurst(e, 0, 0, 20, false));
      expect(superBurst(e, 0, 0, 2, true)?.paths).toEqual(superBurst(e, 0, 0, 20, true)?.paths);
    }
    expect(burstAlpha(0)).toBe(1);
    expect(burstAlpha(BURST_TICKS)).toBe(0);
  });
});
