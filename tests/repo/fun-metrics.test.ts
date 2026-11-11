import { describe, expect, it } from 'vitest';
import { SimEventKind, type SimEvent } from '../../src/core/sim/events';
import { percentile, reduceFunMetrics, summarizeFun } from '../../tools/sim/fun-metrics';
import { collectCommands, type AgentState } from '../../src/core/agents/agent';
import { characterId } from '../../src/core/data/ids';
import { DEFAULT_SIM_FLAGS } from '../../src/core/flags';
import { Cmd } from '../../src/core/sim/commands';
import { createMatch, type MatchSetup } from '../../src/core/sim/match';
import { snapshotState, restoreState } from '../../src/core/sim/state';
import { step } from '../../src/core/sim/step';
import { makeAgent, parseRuleOptions, runMatch, SUPER_SOURCE } from '../../tools/sim/run-match';

let seq = 0;
const ev = (tick: number, kind: number, payload: Record<string, number> = {}): SimEvent =>
  ({ ...payload, tick, sourceId: 0, kind, seq: seq++ }) as SimEvent;
const hit = (tick: number, attacker: number, ability: number, amount: number, counter = 0): SimEvent =>
  ev(tick, SimEventKind.hitConfirmed, { attacker, target: 1 - attacker, ability, amount, counter });
const meta = { ticks: 500, endReason: 'ko', teamOf: (id: number) => id } as const;

describe('fun-metrics reducer', () => {
  it('measures first hit, combos, diversity, lead changes and counters on synthetic events', () => {
    const m = reduceFunMetrics(
      [
        ev(10, 54), // fight
        hit(60, 0, 1, 10, 1),
        hit(70, 0, 1, 10),
        ev(80, SimEventKind.comboEnded, { team: 0, hits: 2, damage: 20 }),
        hit(100, 1, 2, 30), // team 1 takes the lead
        ev(110, SimEventKind.comboEnded, { team: 1, hits: 1, damage: 30 }),
        hit(150, 0, 2, 20), // and loses it again
        ev(120, SimEventKind.recovered, { id: 1, reason: 1 }),
        ev(121, 46),
        ev(122, 52),
        ev(123, 50),
        ev(124, 48),
        ev(125, 44),
        ev(126, 43),
        ev(127, 47),
        ev(128, SimEventKind.weatherChanged, { weather: 1, prev: 0, team: 0 }),
      ],
      meta,
    );
    expect(m.seconds).toBe(10);
    expect(m.firstHitSeconds).toBe(1); // (60 - 10) / 50
    expect(m.hits).toBe(4);
    expect(m.counterHits).toBe(1);
    expect(m.comboHits).toEqual([2, 1]);
    expect(m.maxCombo).toBe(2);
    expect(m.damageByAbility).toEqual({ '1': 20, '2': 50 });
    expect(m.diversity).toBeCloseTo(1 / ((20 / 70) ** 2 + (50 / 70) ** 2), 2);
    expect(m.topSourceShare).toBeCloseTo(50 / 70, 2);
    expect(m.leadChanges).toBe(2);
    expect(m.recovered).toEqual([0, 1, 0]);
    expect([m.dashes, m.tags, m.supers, m.clashes, m.defence]).toEqual([1, 1, 1, 1, 3]);
    expect([m.guards, m.parries, m.dodges, m.weathers]).toEqual([1, 1, 1, 1]);
  });

  it('measures rounds: length from `fight` to `roundEnded`, first hit per round, time over and perfects (FUN-DESIGN 2.10)', () => {
    const m = reduceFunMetrics(
      [
        ev(0, SimEventKind.roundStarted, { round: 1 }),
        ev(90, SimEventKind.fight),
        hit(140, 0, 1, 10),
        ev(590, SimEventKind.ko, { team: 1, perfect: 1 }),
        ev(740, SimEventKind.roundEnded, { winner: 0, won0: 1, won1: 0 }),
        ev(800, SimEventKind.roundStarted, { round: 2 }),
        ev(890, SimEventKind.fight),
        hit(1090, 1, 2, 10),
        hit(1100, 1, 2, 10),
        ev(5390, SimEventKind.timeOver),
        ev(5390, SimEventKind.roundEnded, { winner: 1, won0: 1, won1: 1 }),
        ev(5450, SimEventKind.roundStarted, { round: 3 }),
        ev(5540, SimEventKind.fight), // a round with no hit and no end (the run stopped)
      ],
      { ...meta, ticks: 5600 },
    );
    expect(m.firstHitSeconds).toBe(1); // (140 - 90) / 50, from the first fight
    expect(m.roundFirstHitSeconds).toEqual([1, 4]);
    expect(m.roundSeconds).toEqual([13, 90]);
    expect([m.timeOvers, m.perfects]).toEqual([1, 1]);
    expect(summarizeFun([m])).toMatchObject({ rounds: 2, medianRoundSeconds: 90, p10RoundSeconds: 13, timeOverRate: 0.5, perfects: 1, medianFirstHitSeconds: 4 });
  });

  it('handles an empty match', () => {
    const m = reduceFunMetrics([], { ...meta, endReason: 'stalemate' });
    expect(m).toMatchObject({ firstHitSeconds: null, hits: 0, diversity: 0, topSourceShare: 0, leadChanges: 0, comboHits: [] });
    expect(summarizeFun([m])).toMatchObject({ stalemateRate: 1, medianComboHits: 0, counterHitRate: 0 });
    expect(summarizeFun([])).toMatchObject({ matches: 0, medianSeconds: 0, rounds: 0, timeOverRate: 0 });
  });

  it('pools matches into medians and percentiles', () => {
    expect(percentile([5, 1, 3], 0.5)).toBe(3);
    expect(percentile([], 0.9)).toBe(0);
    const a = reduceFunMetrics([hit(5, 0, 1, 10), ev(9, SimEventKind.comboEnded, { hits: 3 })], { ...meta, ticks: 100 });
    const b = reduceFunMetrics([hit(5, 0, 1, 10), ev(9, SimEventKind.comboEnded, { hits: 7 })], { ...meta, ticks: 300, endReason: 'timeout' });
    expect(summarizeFun([a, b])).toMatchObject({ matches: 2, timeoutRate: 0.5, maxComboHits: 7, p90ComboHits: 7, medianSeconds: 6 });
  });
});

describe('run-match rule options', () => {
  const base = { raceA: 'lavax', raceB: 'pax', agentA: 'scripted', agentB: 'scripted', seed: 7, level: 1, difficulty: 1, aIsTeam0: true } as const;

  it('parses and validates', () => {
    expect(parseRuleOptions(undefined, undefined, undefined)).toEqual({ ruleset: 'classic', teamSize: 1, aiLevel: 3 });
    expect(parseRuleOptions('arcade', '2', '5')).toEqual({ ruleset: 'arcade', teamSize: 2, aiLevel: 5 });
    expect(() => parseRuleOptions('x', undefined, undefined)).toThrow();
    expect(parseRuleOptions('arcade', '3', undefined)).toEqual({ ruleset: 'arcade', teamSize: 3, aiLevel: 3 });
    expect(() => parseRuleOptions(undefined, '4', undefined)).toThrow();
    expect(() => parseRuleOptions(undefined, undefined, '9')).toThrow();
  });

  it('Classic is unchanged by the new options and carries no fun metrics', () => {
    const plain = runMatch(base);
    expect(runMatch({ ...base, ruleset: 'classic', teamSize: 1, aiLevel: 5 })).toEqual(plain);
    expect(plain.fun).toBeUndefined();
  });

  it('Arcade runs deterministically with fun metrics and attributes every hit', () => {
    const a = runMatch({ ...base, ruleset: 'arcade' });
    expect(runMatch({ ...base, ruleset: 'arcade' })).toEqual(a);
    expect(a.fun?.hits).toBeGreaterThan(0);
    expect(a.damageByAbility['unknown']).toBeUndefined();
  });

  it('names super damage', () => {
    const r = runMatch({ ...base, raceA: 'fiara', raceB: 'morblass', ruleset: 'arcade' });
    expect(r.fun?.supers).toBeGreaterThan(0);
    expect(r.damageByAbility[SUPER_SOURCE]).toBeGreaterThan(0);
  });

  it('the scripted agent (Arcade layer included) rewinds with save/load through JSON', () => {
    // Long enough for a super (Arcade lives are about 4x the hits since WP-arcade-numbers, so the meter fills later).
    const PLAY_TICKS = 1200;
    const setup: MatchSetup = {
      simVersion: 1, seed: 0x5eed, flags: { ...DEFAULT_SIM_FLAGS, rulesetArcade: true }, chapter: 1, difficulty: 1,
      p1: [{ character: characterId('fiara'), xp: 1 }], p2: [{ character: characterId('morblass'), xp: 1 }],
    };
    const world = createMatch(setup);
    const agents = [makeAgent('scripted', 'fiara'), makeAgent('scripted', 'morblass')] as const;
    for (let t = 0; t < 150; t++) step(world, collectCommands(world, agents));
    const snap = snapshotState(world.state);
    const saved = JSON.stringify(agents.map((a) => a.save()));
    const play = (pair: typeof agents): number[] =>
      Array.from({ length: PLAY_TICKS }, () => {
        const c = collectCommands(world, pair);
        step(world, c);
        return c[0] | (c[1] << 16);
      });
    const first = play(agents);
    expect(first.some((c) => (c & (Cmd.super | (Cmd.super << 16))) !== 0)).toBe(true);
    restoreState(world.state, snap);
    const fresh = [makeAgent('scripted', 'fiara'), makeAgent('scripted', 'morblass')] as const;
    (JSON.parse(saved) as AgentState[]).forEach((st, i) => fresh[i]?.load(st));
    expect(play(fresh)).toEqual(first);
  });

  it('Arcade 2v2 runs', () => {
    expect(runMatch({ ...base, ruleset: 'arcade', teamSize: 2 }).ticks).toBeGreaterThan(0);
  });

  it('Arcade 3v3 runs to a winner (WP-arcade-3v3)', () => {
    const r = runMatch({ ...base, ruleset: 'arcade', teamSize: 3 });
    expect(r.endReason).not.toBe('stalemate');
    expect(r.winner).not.toBe('draw');
  });
});
