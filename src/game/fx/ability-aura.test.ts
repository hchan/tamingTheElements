import { describe, expect, it } from 'vitest';
import { AURAS, auraPolys, popLook } from './ability-aura';

const box = { x: 100, y: 100, w: 60, h: 80 };

describe('ability auras', () => {
  it('each buff has its own shape, so colour is never the only cue', () => {
    expect(new Set(AURAS.map((a) => a.shape)).size).toBe(AURAS.length);
  });
  it('draws polygons for every aura, with even coordinate counts', () => {
    for (const a of AURAS) {
      const polys = auraPolys(a, box, 7, false);
      expect(polys.length).toBeGreaterThan(0);
      for (const p of polys) expect(p.pts.length % 2).toBe(0);
    }
  });
  it('reduced motion holds still: the polygons do not change with age', () => {
    for (const a of AURAS) expect(auraPolys(a, box, 1, true)).toEqual(auraPolys(a, box, 40, true));
  });
  it('moves with age otherwise', () => {
    for (const a of AURAS) expect(auraPolys(a, box, 1, false)).not.toEqual(auraPolys(a, box, 40, false));
  });
  it('the pop rises and fades; reduced motion does not rise', () => {
    expect(popLook(0, false)).toMatchObject({ alpha: 1 });
    expect(popLook(60, false).alpha).toBe(0);
    expect(popLook(30, true).dy).toBe(0);
  });
});
