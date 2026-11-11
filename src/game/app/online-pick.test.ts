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

  it('round-trips a three-hero team and a two-hero team, and a no-bench pick stays the original bytes', () => {
    const [r0, r1, r2, r3] = ARCADE_RACES;
    const three = { race: r0 as typeof a.race, bench: [r1, r2] as typeof ARCADE_RACES, seed: 99 };
    expect(decodePick(encodePick(three))).toEqual(three);
    const two = { race: r0 as typeof a.race, bench: [r3] as typeof ARCADE_RACES, seed: 5 };
    expect(decodePick(encodePick(two))).toEqual(two);
    expect(encodePick({ ...a, bench: [] })).toEqual(encodePick(a));
  });
  it('refuses a malformed bench: repeats, unknown races, bad counts, truncation, trailing bytes', () => {
    const [r0, r1, r2] = ARCADE_RACES;
    const lead = r0 as typeof a.race;
    expect(decodePick(encodePick({ race: lead, bench: [lead], seed: 1 }))).toBeUndefined();
    expect(decodePick(encodePick({ race: lead, bench: [r1 as typeof a.race, r1 as typeof a.race], seed: 1 }))).toBeUndefined();
    expect(decodePick(encodePick({ race: lead, bench: ['nobody' as never], seed: 1 }))).toBeUndefined();
    const ok = encodePick({ race: lead, bench: [r1 as typeof a.race, r2 as typeof a.race], seed: 1 });
    expect(decodePick(ok.subarray(0, ok.length - 1))).toBeUndefined();
    expect(decodePick(Uint8Array.of(...ok, 0))).toBeUndefined();
    const count = ok.length - 1 - (r1 as string).length - 1 - (r2 as string).length - 1;
    const bad = Uint8Array.from(ok);
    bad[count] = 3;
    expect(decodePick(bad)).toBeUndefined();
    bad[count] = 0;
    expect(decodePick(bad)).toBeUndefined();
  });
  it('builds a 3v3 from both teams, identically on both sides, and trims to the smaller team', () => {
    const [r0, r1, r2, r3, r4, r5] = ARCADE_RACES;
    const host = { race: r0 as typeof a.race, bench: [r1, r2] as typeof ARCADE_RACES, seed: 42 };
    const join = { race: r3 as typeof a.race, bench: [r4, r5] as typeof ARCADE_RACES, seed: 0 };
    const s = onlineSetup(host, join);
    expect(s.p1.map((m) => m.character)).toEqual([r0, r1, r2]);
    expect(s.p2.map((m) => m.character)).toEqual([r3, r4, r5]);
    expect(onlineSetup(decodePick(encodePick(host)) ?? host, decodePick(encodePick(join)) ?? host)).toEqual(s);
    const small = onlineSetup(host, { race: r3 as typeof a.race, seed: 0 });
    expect(small.p1).toHaveLength(1);
    expect(small.p2).toHaveLength(1);
    expect(onlineSetup(host, { ...join, bench: [r4 as typeof a.race] }).p1).toHaveLength(2);
  });
});
