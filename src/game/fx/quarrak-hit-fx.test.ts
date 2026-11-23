import { describe, expect, it } from 'vitest';
import { HURL_HIT_TICKS, ROLL_HIT_TICKS, hurlImpact, rollImpact } from './quarrak-hit-fx';

describe('quarrak hit fx', () => {
  it('is drawn while live and gone after its ticks or before the cast', () => {
    expect(hurlImpact(0, 0, 0, 0, false)?.shards).toHaveLength(16);
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
  it('Hurl Rock bursts bigger than before and adds a soft, dull flash that shrinks and fades; Boulder Roll has none', () => {
    const a = hurlImpact(0, 0, 0, 1, false);
    const b = hurlImpact(0, 0, 0, 14, false);
    expect(a?.flash?.a).toBeGreaterThan(0);
    expect(a?.flash?.a).toBeLessThanOrEqual(0.25);
    expect(b?.flash?.r).toBeLessThan(a?.flash?.r ?? 0);
    expect(b?.flash?.a).toBeLessThan(a?.flash?.a ?? 0);
    expect(rollImpact(0, 0, 0, 1, false)?.flash).toBeUndefined();
    expect(Math.min(...(a?.shards.map((s) => s.r) ?? [0]))).toBeGreaterThanOrEqual(6);
  });
  it('reduced motion holds still: same shapes at any age', () => {
    expect(hurlImpact(5, 5, 1, 1, true)).toEqual(hurlImpact(5, 5, 1, 12, true));
  });
});
