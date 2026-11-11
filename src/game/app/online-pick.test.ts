import { describe, expect, it } from 'vitest';
import { ARCADE_RACES } from './arcade-pick';
import { decodePick, encodePick, onlineSetup } from './online-pick';

const a = { race: ARCADE_RACES[0] as (typeof ARCADE_RACES)[number], seed: 123456 };
const b = { race: ARCADE_RACES[3] as (typeof ARCADE_RACES)[number], seed: 0 };

describe('online pick', () => {
  it('round-trips', () => {
    expect(decodePick(encodePick(a))).toEqual(a);
  });
  it('refuses junk, unknown races and wrong lengths', () => {
    expect(decodePick(Uint8Array.of(1, 2, 3))).toBeUndefined();
    expect(decodePick(new Uint8Array(0))).toBeUndefined();
    const ok = encodePick(a);
    expect(decodePick(ok.subarray(0, ok.length - 1))).toBeUndefined();
    const bad = encodePick({ race: 'nobody' as never, seed: 1 });
    expect(decodePick(bad)).toBeUndefined();
  });
  it('both sides derive the identical setup', () => {
    const host = onlineSetup(a, b);
    const join = onlineSetup(decodePick(encodePick(a)) ?? a, decodePick(encodePick(b)) ?? a);
    expect(join).toEqual(host);
    expect(host.p1[0]?.character).toBe(a.race);
    expect(host.p2[0]?.character).toBe(b.race);
    expect(host.seed).toBe(123456);
  });
});
