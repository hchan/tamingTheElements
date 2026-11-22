import { describe, expect, it } from 'vitest';
import golden from '../../../tests/fixtures/replays/random-vs-random.replay.json';
import cheat from '../../../tests/fixtures/replays/arcade-1v1.replay.json';
import { SIM_VERSION } from '../version';
import { HASH_INTERVAL } from './format';
import { verifyReplayLog } from './verify-log';

interface Mut {
  header: { tickCount: number; cheats?: boolean; setup: { p1: { character: string; xp: number }[] } };
  inputs: number[][];
  hashes: number[];
  finalHash: number;
}
const clone = (src: unknown = golden): Mut => JSON.parse(JSON.stringify(src)) as Mut;

describe('verifyReplayLog', () => {
  it('reproduces the golden final hash and every checkpoint', () => {
    const r = verifyReplayLog(golden, { simVersion: SIM_VERSION });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.finalHash).toBe(golden.finalHash);
    expect(r.checkpoints).toEqual(golden.hashes);
    expect(r.checkpoints.length).toBe(Math.ceil(golden.header.tickCount / HASH_INTERVAL));
  });

  it('simulates a bare command log without claimed hashes', () => {
    const { header, inputs } = clone();
    const r = verifyReplayLog({ header, inputs });
    expect(r.ok && r.finalHash).toBe(golden.finalHash);
  });

  it('flags a tampered command stream as a mismatch', () => {
    const t = clone();
    t.inputs[0] = [1, golden.header.tickCount];
    const r = verifyReplayLog(t);
    expect(r.ok).toBe(false);
    if (r.ok || r.kind !== 'mismatch') throw new Error('expected mismatch');
    expect(r.firstDivergentTick).toBeGreaterThan(0);
    expect(r.actual).not.toBe(r.expected);
  });

  it('names the first divergent checkpoint tick of a tampered hash', () => {
    const t = clone();
    t.hashes[2] = (t.hashes[2] as number) ^ 1;
    const r = verifyReplayLog(t);
    expect(r.ok).toBe(false);
    if (r.ok || r.kind !== 'mismatch') throw new Error('expected mismatch');
    expect(r.firstDivergentTick).toBe(2 * HASH_INTERVAL);
    expect(r.message).toMatch(/^DIVERGED at tick 100 /);
  });

  it('flags a tampered final hash and a bare tampered log gives a different hash', () => {
    const t = clone();
    t.finalHash = (golden.finalHash + 1) | 0;
    const r = verifyReplayLog(t);
    expect(!r.ok && r.kind === 'mismatch' && r.firstDivergentTick).toBe(golden.header.tickCount);
    const bare = verifyReplayLog({ header: t.header, inputs: [[1, golden.header.tickCount], t.inputs[1]] });
    expect(bare.ok && bare.finalHash).not.toBe(golden.finalHash);
  });

  it('a different seed changes the outcome, a bad seed is invalid', () => {
    const seeded = verifyReplayLog(golden, { seed: golden.header.seed + 1 });
    expect(seeded.ok).toBe(false);
    expect(verifyReplayLog(golden, { seed: -1 })).toMatchObject({ ok: false, kind: 'invalid' });
  });

  it('refuses a sim version mismatch', () => {
    expect(verifyReplayLog(golden, { simVersion: SIM_VERSION + 1 })).toMatchObject({ ok: false, kind: 'invalid' });
  });

  it('never throws on malformed input', () => {
    const bad: unknown[] = [undefined, null, 5, 'x', [], {}, { header: 1 }, { header: {}, inputs: [] }];
    for (const b of bad) expect(verifyReplayLog(b)).toMatchObject({ ok: false, kind: 'invalid' });
    const t = clone();
    t.inputs = [[1], [2]];
    expect(verifyReplayLog(t)).toMatchObject({ ok: false, kind: 'invalid' });
    t.header.setup.p1 = [{ character: 'nope', xp: 0 }];
    expect(verifyReplayLog(t)).toMatchObject({ ok: false, kind: 'invalid' });
  });

  it('refuses tester-mode logs', () => {
    const t = clone(cheat);
    t.header.cheats = true;
    expect(verifyReplayLog(t)).toMatchObject({ ok: false, kind: 'invalid' });
  });
});
