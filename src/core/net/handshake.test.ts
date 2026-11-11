import { describe, expect, it } from 'vitest';
import { DEFAULT_SIM_FLAGS } from '../flags';
import { SIM_VERSION } from '../version';
import type { MatchSetup } from '../sim/match';
import { checkHello, decodeHello, encodeHello, helloOf, type Hello } from './handshake';

const setup = (over: Partial<MatchSetup> = {}): MatchSetup =>
  ({
    simVersion: SIM_VERSION,
    seed: 0xdeadbeef,
    flags: DEFAULT_SIM_FLAGS,
    chapter: 2,
    difficulty: 1.5,
    p1: [{ character: 'fire-mage', xp: 120 }, { character: 'water-imp', xp: 0 }],
    p2: [{ character: 'air-bat', xp: 40 }],
    ...over,
  }) as unknown as MatchSetup;

describe('handshake', () => {
  it('round-trips and agrees with itself', () => {
    const h = helloOf(setup());
    expect(decodeHello(encodeHello(h))).toEqual(h);
    expect(checkHello(h, h)).toBeUndefined();
  });

  it('names the first difference', () => {
    const h = helloOf(setup());
    const t = (o: Partial<Hello>): ReturnType<typeof checkHello> => checkHello(h, { ...h, ...o });
    expect(t({ simVersion: h.simVersion + 1 })).toBe('simVersion');
    expect(t({ flags: h.flags | 1 })).toBe('flags');
    expect(t({ seed: 1 })).toBe('seed');
    expect(t({ chapter: 3 })).toBe('chapter');
    expect(t({ difficulty: 2 })).toBe('difficulty');
    expect(t({ p2: [{ character: 'earth-ox', xp: 40 }] })).toBe('roster');
    expect(t({ p1: [] })).toBe('roster');
  });

  it('refuses a cheats match on either side', () => {
    const h = helloOf(setup());
    expect(checkHello({ ...h, cheats: true }, h)).toBe('cheats');
    expect(checkHello(h, { ...h, cheats: true })).toBe('cheats');
  });

  it('decoding an untrusted buffer never throws and rejects malformed input', () => {
    const good = encodeHello(helloOf(setup()));
    expect(decodeHello(new Uint8Array(0))).toBeUndefined();
    expect(decodeHello(good.subarray(0, good.length - 1))).toBeUndefined();
    expect(decodeHello(new Uint8Array([...good, 0]))).toBeUndefined();
    const bad = good.slice();
    bad[0] = 0;
    expect(decodeHello(bad)).toBeUndefined();
    const big = good.slice();
    big[20] = 200; // p1 roster length
    expect(decodeHello(big)).toBeUndefined();
    for (let i = 0; i < 300; i++) {
      const junk = Uint8Array.from({ length: i % 60 }, (_, k) => (k * 37 + i * 11) & 255);
      expect(() => decodeHello(junk)).not.toThrow();
    }
  });
});
