import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { REPLAY_END_DETAIL_MAX } from './format';
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
  const withEnd = (end: unknown): unknown => mutate(base, (_h, r) => { r['end'] = end; });
  const GOOD_END = { reason: 3, detail: 'batch-ack', tick: 40, winner: 2, resultSent: true };

  it('accepts a good end note and rejects a bad one', () => {
    expect(validateReplay(withEnd(GOOD_END)).ok).toBe(true);
    for (const bad of [
      { ...GOOD_END, reason: 4 },
      { ...GOOD_END, reason: 1.5 },
      { ...GOOD_END, detail: 'x'.repeat(REPLAY_END_DETAIL_MAX + 1) },
      { ...GOOD_END, detail: 5 },
      { ...GOOD_END, tick: -1 },
      'nope',
    ]) expect(validateReplay(withEnd(bad)).ok).toBe(false);
  });
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

  it('checks command bits against the ruleset input mask (inputMaskFor)', () => {
    const withInput = (flags: string, cmd: number): unknown =>
      mutate(base, (h, r) => { h['flags'] = flags; r['inputs'] = [[0, 50, cmd, 50], [0, 100]]; });
    expect(validateReplay(withInput('', 0x7ff)).ok).toBe(true);
    expect(validateReplay(withInput('', 1 << 11))).toEqual({ ok: false, message: 'The replay uses command bits its ruleset does not allow.' });
    expect(validateReplay(withInput('rulesetArcade', 0x1ffff)).ok).toBe(true);
    expect(validateReplay(withInput('', 1 << 16)).ok).toBe(false);
    expect(validateReplay(withInput('rulesetArcade', 1 << 17)).ok).toBe(false);
    expect(validateReplay(withInput('', 1 << 14)).ok).toBe(false);
    expect(validateReplay(withInput('', 1 << 15)).ok).toBe(false);
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
