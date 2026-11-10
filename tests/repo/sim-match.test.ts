import { describe, expect, it } from 'vitest';
import { levelFromXp } from '../../src/core/rules/progression';
import {
  MATRIX_ELEMENTS,
  RACES,
  main,
  matchSeed,
  runMatch,
  runPairing,
  runTournament,
  wilson95,
  xpForLevel,
} from '../../tools/sim/run-match';

const base = { level: 3, difficulty: 1 } as const;

describe('sim:match helpers', () => {
  it('has the 12 playable races', () => {
    expect(RACES).toHaveLength(12);
    expect(RACES).not.toContain('dummy');
    expect(RACES).not.toContain('eternal-void');
  });

  it('xpForLevel inverts levelFromXp', () => {
    for (let level = 1; level <= 20; level++) expect(levelFromXp(xpForLevel(level))).toBe(level);
  });

  it('matchSeed is stable and varies with the index', () => {
    expect(matchSeed(1, 0)).toBe(matchSeed(1, 0));
    expect(matchSeed(1, 0)).not.toBe(matchSeed(1, 1));
  });

  it('wilson95 brackets the point estimate', () => {
    const [lo, hi] = wilson95(5, 10);
    expect(lo).toBeLessThan(0.5);
    expect(hi).toBeGreaterThan(0.5);
    expect(wilson95(0, 0)).toEqual([0, 1]);
  });
});

describe('sim:match runner', () => {
  it('is deterministic for a seed', () => {
    const o = { raceA: 'fiara', raceB: 'curomo', agentA: 'scripted', agentB: 'random', aIsTeam0: true, seed: 99, ...base } as const;
    expect(runMatch(o)).toEqual(runMatch(o));
  });

  it('records winner, ticks and damage per ability', () => {
    const { summary, results } = runPairing({ ...base, seed: 7, a: 'fiara', b: 'pax', agents: ['scripted', 'scripted'], seeds: 4 });
    expect(results).toHaveLength(4);
    expect(summary.winsA + summary.winsB + summary.draws).toBe(4);
    expect(summary.meanTicks).toBeGreaterThan(0);
    expect(Object.keys(summary.damageByAbility)).toContain('fireball');
    const shares = Object.values(summary.damageShare).reduce((x, y) => x + y, 0);
    expect(shares).toBeGreaterThan(0.99);
    expect(shares).toBeLessThan(1.01);
    expect(summary.winRateCI95[0]).toBeLessThanOrEqual(summary.winRateA);
  });

  it('detects a stalemate when nobody can hurt anybody', () => {
    const r = runMatch({ raceA: 'pax', raceB: 'treenoc', agentA: 'random', agentB: 'random', aIsTeam0: true, seed: 1, ...base, stalemateTicks: 50 });
    expect(['stalemate', 'ko']).toContain(r.endReason);
    expect(r.ticks).toBeLessThan(9000);
  });

  it('ends at maxTicks as a timeout', () => {
    const r = runMatch({ raceA: 'pax', raceB: 'pax', agentA: 'random', agentB: 'random', aIsTeam0: true, seed: 1, ...base, maxTicks: 5, stalemateTicks: 1000 });
    expect(r).toMatchObject({ ticks: 5, endReason: 'timeout', winner: 'draw' });
  });

  it('tournament covers all pairings and a 4x4 element matrix', () => {
    const t = runTournament({ ...base, seed: 7, agents: ['scripted', 'scripted'], seeds: 1 });
    expect(t.pairs).toHaveLength(66);
    expect(t.ranking).toHaveLength(12);
    expect(t.matrix.elements).toEqual(MATRIX_ELEMENTS);
    expect(t.matrix.cells).toHaveLength(4);
    expect(t.matrix.cells.every((row) => row.length === 4)).toBe(true);
    expect(t.matrix.cells[0]?.[1]?.winRate).toBeCloseTo(1 - (t.matrix.cells[1]?.[0]?.winRate ?? 0), 3);
  });

  it('rejects bad usage with exit code 2', () => {
    const err = console.error;
    console.error = () => undefined;
    try {
      expect(main(['--a', 'nobody', '--b', 'pax'])).toBe(2);
    } finally {
      console.error = err;
    }
  });
});

describe('sim:match speed', () => {
  // Measured on a laptop: about 20k ticks/s with random bots (cold, JIT included), 100k+ with scripted bots.
  // The bound is deliberately generous so slow CI does not flake.
  it('simulates at least 5000 ticks per second', () => {
    const t0 = performance.now();
    let ticks = 0;
    for (let i = 0; i < 8; i++) {
      ticks += runMatch({
        raceA: 'rokcore',
        raceB: 'wispera',
        agentA: 'random',
        agentB: 'random',
        aIsTeam0: i % 2 === 0,
        seed: i,
        ...base,
        maxTicks: 2000,
        stalemateTicks: 100000,
      }).ticks;
    }
    const perSecond = ticks / ((performance.now() - t0) / 1000);
    expect(ticks).toBeGreaterThan(1000);
    expect(perSecond).toBeGreaterThan(5000);
  });
});
