import { describe, expect, it } from 'vitest';
import { HALF_SEGS, ROPE_GROW_TICKS, halfPoint, revealSegs, ropeGrow } from './rope-arcs';

describe('rope arcs', () => {
  const p: [number, number] = [0, 0];
  it('the near half runs below the centre and the far half above, on the unit circle', () => {
    for (const far of [false, true]) {
      for (let i = 0; i <= HALF_SEGS; i++) {
        halfPoint(far, i, p);
        expect(far ? p[1] <= 1e-9 : p[1] >= -1e-9).toBe(true);
        expect(Math.hypot(p[0], p[1])).toBeCloseTo(1, 9);
      }
    }
  });
  it('the two halves close into one ring at both ends', () => {
    halfPoint(false, 0, p);
    const nearStart = p[0];
    halfPoint(true, HALF_SEGS, p);
    expect(p[0]).toBeCloseTo(nearStart, 9);
    halfPoint(false, HALF_SEGS, p);
    const nearEnd = p[0];
    halfPoint(true, 0, p);
    expect(p[0]).toBeCloseTo(nearEnd, 9);
  });
  it('clamps the index', () => {
    halfPoint(false, 99, p);
    const hi = [...p];
    halfPoint(false, HALF_SEGS, p);
    expect(p).toEqual(hi);
  });
  it('grows from nothing to closed over ROPE_GROW_TICKS and holds closed under reduced motion', () => {
    expect(ropeGrow(0, false)).toBe(0);
    expect(ropeGrow(ROPE_GROW_TICKS / 2, false)).toBeCloseTo(0.5, 9);
    expect(ropeGrow(99, false)).toBe(1);
    expect(ropeGrow(0, true)).toBe(1);
  });
  it('closes loop 0 before loop 1 and never exceeds a full half', () => {
    expect(revealSegs(0, 0)).toBe(0);
    expect(revealSegs(0.25, 0)).toBe(HALF_SEGS / 2);
    expect(revealSegs(0.25, 1)).toBe(0);
    expect(revealSegs(0.5, 0)).toBe(HALF_SEGS);
    expect(revealSegs(0.75, 1)).toBe(HALF_SEGS / 2);
    expect(revealSegs(1, 1)).toBe(HALF_SEGS);
    let last = 0;
    for (let g = 0; g <= 1; g += 0.05) {
      const n = revealSegs(g, 1);
      expect(n).toBeGreaterThanOrEqual(last);
      last = n;
    }
  });
});
