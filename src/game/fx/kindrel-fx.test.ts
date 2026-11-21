import { describe, expect, it } from 'vitest';
import { BITE_TICKS, SPRAY_TICKS, cinderSpray, emberBite } from './kindrel-fx';

describe('kindrel fx', () => {
  it('ember bite is drawn while live and gone after its ticks', () => {
    expect(emberBite(0, 0, 0, 0, false)?.arcs).toHaveLength(2);
    expect(emberBite(0, 0, 0, BITE_TICKS + 1, false)).toBeUndefined();
    for (const a of emberBite(0, 0, 3, 4, false)?.arcs ?? []) expect(a.length % 2).toBe(0);
  });
  it('ember bite leans the way the caster aims', () => {
    const e = emberBite(0, 0, 0, 3, false)?.sparks[0];
    const w = emberBite(0, 0, 4, 3, false)?.sparks[0];
    expect(e?.x).toBeGreaterThan(0);
    expect(w?.x).toBeLessThan(0);
  });
  it('cinder spray ring grows and fades, then ends', () => {
    const a = cinderSpray(0, 0, 2, false);
    const b = cinderSpray(0, 0, 20, false);
    expect(b?.ring.r).toBeGreaterThan(a?.ring.r ?? 0);
    expect(b?.alpha).toBeLessThan(a?.alpha ?? 0);
    expect(cinderSpray(0, 0, SPRAY_TICKS + 1, false)).toBeUndefined();
  });
  it('reduced motion holds still: same shapes at any age', () => {
    expect(emberBite(5, 5, 1, 1, true)).toEqual(emberBite(5, 5, 1, 12, true));
    expect(cinderSpray(5, 5, 1, true)).toEqual(cinderSpray(5, 5, 20, true));
  });
});
