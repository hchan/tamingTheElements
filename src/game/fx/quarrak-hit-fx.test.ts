import { describe, expect, it } from 'vitest';
import { HURL_HIT_TICKS, ROLL_HIT_TICKS, hurlImpact, rollImpact } from './quarrak-hit-fx';

describe('quarrak hit fx', () => {
  it('is drawn while live and gone after its ticks or before the cast', () => {
    expect(hurlImpact(0, 0, 0, 0, false)?.shards).toHaveLength(9);
    expect(hurlImpact(0, 0, 0, HURL_HIT_TICKS + 1, false)).toBeUndefined();
    expect(rollImpact(0, 0, 0, ROLL_HIT_TICKS + 1, false)).toBeUndefined();
    expect(rollImpact(0, 0, 0, -1, false)).toBeUndefined();
  });
  it('lands at the far end of the cast on the facing side', () => {
    expect(hurlImpact(100, 0, 0, 3, false)?.ring.x).toBe(330);
    expect(hurlImpact(100, 0, 4, 3, false)?.ring.x).toBe(-130);
    expect(rollImpact(100, 0, 0, 3, false)?.ring.x).toBe(400);
  });
  it('the dust cloud spreads and fades; the boulder breaks into more shards than the rock', () => {
    const a = rollImpact(0, 0, 0, 2, false);
    const b = rollImpact(0, 0, 0, 18, false);
    expect(b?.ring.r).toBeGreaterThan(a?.ring.r ?? 0);
    expect(b?.alpha).toBeLessThan(a?.alpha ?? 0);
    expect(rollImpact(0, 0, 0, 12, false)?.shards.length).toBeGreaterThan(hurlImpact(0, 0, 0, 8, false)?.shards.length ?? 99);
  });
  it('reduced motion holds still: same shapes at any age', () => {
    expect(hurlImpact(5, 5, 1, 1, true)).toEqual(hurlImpact(5, 5, 1, 12, true));
  });
});
