import { describe, expect, it } from 'vitest';
import { SKITTER_HOP_PX, SKITTER_TICKS, skitterHop } from './zephra-fx';

describe('zephra skitter fx', () => {
  it('is drawn while live and gone after its ticks', () => {
    expect(skitterHop(0, 0, 0, 0, false)?.streaks).toHaveLength(5);
    expect(skitterHop(0, 0, 0, SKITTER_TICKS + 1, false)).toBeUndefined();
  });
  it('hops backward: facing east lands west, facing west lands east', () => {
    expect(skitterHop(100, 0, 0, 5, false)?.puff.x).toBe(100 - SKITTER_HOP_PX);
    expect(skitterHop(100, 0, 4, 5, false)?.puff.x).toBe(100 + SKITTER_HOP_PX);
  });
  it('streaks stay on the hop path and the puff grows and fades', () => {
    const a = skitterHop(0, 0, 0, 2, false);
    const b = skitterHop(0, 0, 0, 18, false);
    for (const s of a?.streaks ?? []) {
      expect(s.x1).toBeLessThanOrEqual(0);
      expect(s.x1).toBeGreaterThanOrEqual(-SKITTER_HOP_PX);
    }
    expect(b?.puff.r).toBeGreaterThan(a?.puff.r ?? 0);
    expect(b?.alpha).toBeLessThan(a?.alpha ?? 0);
  });
  it('reduced motion holds still: same shapes at any age', () => {
    expect(skitterHop(5, 5, 1, 1, true)).toEqual(skitterHop(5, 5, 1, 20, true));
  });
});
