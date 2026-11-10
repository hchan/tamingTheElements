import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { parseReplayChecked, validateReplay, MAX_REPLAY_TICKS } from './validate';

const BASE: Record<string, unknown> = {
  header: {
    simVersion: 1,
    seed: 7,
    flags: '',
    setup: {
      chapter: 3,
      difficulty: 0.85,
      p1: [{ character: 'curomo', xp: 10 }],
      p2: [{ character: 'dummy', xp: 5 }],
    },
    tickCount: 100,
  },
  inputs: [[0, 100], [16, 60, 0, 40]],
  hashes: [1, 2],
  finalHash: 3,
};

function mutate(base: Record<string, unknown>, fn: (h: Record<string, unknown>, r: Record<string, unknown>) => void): unknown {
  const r = JSON.parse(JSON.stringify(base)) as Record<string, unknown>;
  fn(r['header'] as Record<string, unknown>, r);
  return r;
}

describe('validateReplay', () => {
  it('accepts a well-formed replay', () => {
    expect(validateReplay(BASE).ok).toBe(true);
  });

  const base = BASE;
  const setup = (h: Record<string, unknown>): Record<string, unknown> => h['setup'] as Record<string, unknown>;

  it.each([
    ['an unknown character', (h: Record<string, unknown>) => { ((setup(h)['p1'] as Record<string, unknown>[])[0] as Record<string, unknown>)['character'] = 'nope'; }],
    ['a huge tickCount', (h: Record<string, unknown>) => { h['tickCount'] = MAX_REPLAY_TICKS + 1; }],
    ['a negative seed', (h: Record<string, unknown>) => { h['seed'] = -1; }],
    ['a bad chapter', (h: Record<string, unknown>) => { setup(h)['chapter'] = 9; }],
    ['unknown flags', (h: Record<string, unknown>) => { h['flags'] = 'bogus'; }],
    ['an empty roster', (h: Record<string, unknown>) => { setup(h)['p2'] = []; }],
    ['NaN difficulty', (h: Record<string, unknown>) => { setup(h)['difficulty'] = null; }],
  ])('rejects %s', (_n, fn) => {
    expect(validateReplay(mutate(base, fn)).ok).toBe(false);
  });

  it('rejects an RLE run longer than the match without decoding it', () => {
    const bad = mutate(base, (_h, r) => { r['inputs'] = [[0, 4_000_000_000], [0, 1]]; });
    expect(validateReplay(bad).ok).toBe(false);
  });

  it('rejects mismatched checkpoint counts', () => {
    expect(validateReplay(mutate(base, (_h, r) => { r['hashes'] = []; })).ok).toBe(false);
  });

  it('gives a friendly message for non-JSON text', () => {
    const r = parseReplayChecked('{nope');
    expect(r).toEqual({ ok: false, message: 'The file is not valid JSON.' });
  });

  it('never throws on arbitrary JSON values', () => {
    fc.assert(
      fc.property(fc.jsonValue(), (v) => {
        expect(() => validateReplay(v)).not.toThrow();
      }),
      { numRuns: 500 },
    );
  });

  it('never throws on arbitrary text', () => {
    fc.assert(
      fc.property(fc.string(), (t) => {
        expect(() => parseReplayChecked(t)).not.toThrow();
      }),
      { numRuns: 300 },
    );
  });

  it('never throws on structurally valid headers with random field values', () => {
    const weird = fc.oneof(fc.integer(), fc.double(), fc.string(), fc.constant(null), fc.array(fc.integer()), fc.boolean());
    fc.assert(
      fc.property(weird, weird, weird, weird, (a, b, c, d) => {
        const r = mutate(base, (h, root) => {
          h['seed'] = a;
          h['tickCount'] = b;
          setup(h)['chapter'] = c;
          root['inputs'] = [d, d];
        });
        expect(() => validateReplay(r)).not.toThrow();
      }),
      { numRuns: 300 },
    );
  });
});
