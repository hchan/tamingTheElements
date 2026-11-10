import { describe, expect, it } from 'vitest';
import { compareNumbers } from '../math/compare';
import { fnv1a, seedSfc32 } from './seed';
import { Sfc32 } from './sfc32';
import { AGENT_STREAM_NAMES, createStreams, loadStreams, saveStreams, STREAM_NAMES } from './streams';

// Independent reference: splitmix32 and sfc32 copied from bryc/code, jshash/PRNGs.md
// (https://github.com/bryc/code/blob/master/jshash/PRNGs.md). Vectors below were produced by
// running these exact functions (float output * 2^32) after seeding as the WP specifies.
function refSplitmix32(a: number) {
  return function () {
    a |= 0;
    a = (a + 0x9e3779b9) | 0;
    let t = a ^ (a >>> 16);
    t = Math.imul(t, 0x21f0aaad);
    t = t ^ (t >>> 15);
    t = Math.imul(t, 0x735a2d97);
    t = t ^ (t >>> 15);
    return (t >>> 0) / 4294967296;
  };
}
function refSfc32(a: number, b: number, c: number, d: number) {
  return function () {
    a |= 0;
    b |= 0;
    c |= 0;
    d |= 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}

const VECTORS: [number, string, number, number[]][] = [
  [0, 'combat', 357838487, [2820248174, 2270727656, 3405125415, 1375883833, 3738766217, 165192289, 3709224029, 3872741485, 2220780849, 1149416397]],
  [12345, 'combat', 3656440426, [269596251, 3597317908, 3121943076, 3781562630, 3261831392, 2232168848, 218957610, 2852846326, 1887768968, 1900885435]],
  [0, 'ai.p1', 2501722026, [353138251, 2511067938, 1538070513, 1337961373, 2033838521, 3158715570, 1627169687, 2427282951, 1561422262, 693128293]],
  [12345, 'cosmetic', 2100145293, [675898484, 1997149934, 2557234308, 4165865052, 983021476, 703840848, 1355806648, 1129860221, 2419560140, 1823280921]],
];

describe('sfc32 / seeding known answers', () => {
  it.each(VECTORS)('seed %i stream %s matches reference vectors', (seed, name, hash, expected) => {
    expect(fnv1a(`${String(seed)}:${name}`)).toBe(hash);
    const rng = seedSfc32(seed, name);
    expect(Array.from({ length: 10 }, () => rng.nextU32())).toEqual(expected);
  });

  it('matches the pasted reference over a long run', () => {
    const sm = refSplitmix32(fnv1a('777:spawn'));
    const u = () => sm() * 4294967296;
    const ref = refSfc32(u(), u(), u(), u());
    for (let i = 0; i < 15; i++) ref();
    const rng = seedSfc32(777, 'spawn');
    for (let i = 0; i < 1000; i++) expect(rng.nextU32()).toBe(ref() * 4294967296);
  });
});

describe('Sfc32 helpers', () => {
  it('nextFloat is u32 / 2^32 in [0,1)', () => {
    const a = seedSfc32(1, 'meta');
    const b = seedSfc32(1, 'meta');
    for (let i = 0; i < 100; i++) {
      const f = a.nextFloat();
      expect(f).toBe(b.nextU32() / 4294967296);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
    }
  });

  it('int stays in range, covers it, and rejects bad n', () => {
    const rng = seedSfc32(2, 'combat');
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) seen.add(rng.int(6));
    expect([...seen].sort(compareNumbers)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(() => rng.int(0)).toThrow(RangeError);
    expect(() => rng.int(1.5)).toThrow(RangeError);
    expect(rng.int(1)).toBe(0);
  });

  it('pick and chance behave', () => {
    const rng = seedSfc32(3, 'combat');
    const arr = ['a', 'b', 'c'];
    for (let i = 0; i < 50; i++) expect(arr).toContain(rng.pick(arr));
    expect(() => rng.pick([])).toThrow(RangeError);
    expect(rng.chance(0)).toBe(false);
    expect(rng.chance(1)).toBe(true);
  });

  it('saveState/loadState round trips', () => {
    const rng = seedSfc32(4, 'capture');
    for (let i = 0; i < 20; i++) rng.nextU32();
    const saved = rng.saveState();
    expect(saved).toBeInstanceOf(Uint32Array);
    expect(saved.length).toBe(4);
    const expected = Array.from({ length: 10 }, () => rng.nextU32());
    rng.loadState(saved);
    expect(Array.from({ length: 10 }, () => rng.nextU32())).toEqual(expected);
    expect(Array.from({ length: 10 }, () => new Sfc32(saved).nextU32())).toEqual(Array(10).fill(expected[0]));
  });
});

describe('streams', () => {
  it('has the five documented sim streams with distinct sequences; agent streams are separate', () => {
    expect([...STREAM_NAMES]).toEqual(['combat', 'capture', 'spawn', 'meta', 'cosmetic']);
    expect([...AGENT_STREAM_NAMES]).toEqual(['ai.p1', 'ai.p2']);
    const s = createStreams(99);
    const firsts = STREAM_NAMES.map((n) => s[n].nextU32());
    expect(new Set(firsts).size).toBe(STREAM_NAMES.length);
  });

  it('drawing from one stream does not affect another', () => {
    const a = createStreams(5);
    const b = createStreams(5);
    for (let i = 0; i < 100; i++) a.cosmetic.nextU32();
    expect(a.combat.nextU32()).toBe(b.combat.nextU32());
  });

  it('save/load restores all streams', () => {
    const s = createStreams(6);
    for (let i = 0; i < 7; i++) s.spawn.nextU32();
    const saved = saveStreams(s);
    const next = STREAM_NAMES.map((n) => s[n].nextU32());
    loadStreams(s, saved);
    expect(STREAM_NAMES.map((n) => s[n].nextU32())).toEqual(next);
  });
});
