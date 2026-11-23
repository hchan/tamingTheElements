import { describe, expect, it } from 'vitest';
import { LURE_TICKS, lureOrb } from './glimmaw-fx';

describe('glimmaw fx', () => {
  it('lure is drawn while live and gone after its ticks', () => {
    expect(lureOrb(0, 0, 0, 0, false)?.stalk.length).toBe(18);
    expect(lureOrb(0, 0, 0, LURE_TICKS + 1, false)).toBeUndefined();
  });
  it('lure hangs on the side the caster faces', () => {
    expect(lureOrb(0, 0, 0, 20, false)?.bulb.x).toBeGreaterThan(0);
    expect(lureOrb(0, 0, 4, 20, false)?.bulb.x).toBeLessThan(0);
  });
  it('lure fades out and keeps its core inside the bulb', () => {
    const a = lureOrb(0, 0, 0, 8, false);
    const b = lureOrb(0, 0, 0, 38, false);
    expect(b?.alpha).toBeLessThan(a?.alpha ?? 0);
    expect(a?.core).toBeLessThan(a?.bulb.r ?? 0);
  });
  it('reduced motion holds still: same shapes at any age', () => {
    expect(lureOrb(5, 5, 1, 1, true)).toEqual(lureOrb(5, 5, 1, 30, true));
  });
});
