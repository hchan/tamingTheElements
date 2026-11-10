import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  METER_BAR, METER_BARS, METER_CAST, METER_CLASH, METER_DEAL_PM, METER_MAX, METER_PARRY, METER_PERFECT_DODGE, METER_TAKE_PM,
} from '../../../data/arcade';
import { characterId } from '../../../data/ids';
import { DEFAULT_SIM_FLAGS } from '../../../flags';
import { levelFromXp } from '../../../rules/progression';
import { Cmd } from '../../commands';
import { EventSink, SimEventKind, type SimEvent } from '../../events';
import { hash } from '../../hash';
import { createMatch, type MatchSetup } from '../../match';
import { skipIntro } from './round-testkit';
import { createSnapshotBuf, restore, snapshot } from '../../snapshot';
import { step } from '../../step';
import type { SimWorld } from '../../world';
import { ABILITY_DEFS } from '../projectile';
import { applyArcadeHit } from './hit';
import { gainMeter, meterBars, meterForDamage, meterOf, meterOnHit } from './meter';

const LEVEL_XP = { 1: 1, 10: 20 } as const;
const LEVELS = [1, 10] as const;
const WIND_CONE = ABILITY_DEFS.findIndex((d) => d.id === 'wind-cone');

function duel(attacker: string, victim: string, level: 1 | 10, arcade = true): SimWorld {
  const xp = LEVEL_XP[level];
  const setup: MatchSetup = {
    simVersion: 7, seed: 7, flags: { ...DEFAULT_SIM_FLAGS, rulesetArcade: arcade }, chapter: 1, difficulty: 1,
    p1: [{ character: characterId(attacker), xp }],
    p2: [{ character: characterId(victim), xp }],
  };
  const world = skipIntro(createMatch(setup));
  // Far apart, so a cast cannot hit on the tick it is checked.
  world.state.x[0] = 100;
  world.state.x[1] = 1100;
  return world;
}

const levels = (e: readonly SimEvent[]): Record<string, number>[] =>
  e.filter((x) => x.kind === SimEventKind.meterLevel).map((x) => ({ team: x['team'] ?? -1, bars: x['bars'] ?? -1 }));

describe('meter table (FUN-DESIGN 2.5)', () => {
  it('has the design numbers', () => {
    expect([METER_BAR, METER_BARS, METER_MAX]).toEqual([1000, 3, 3000]);
    expect([METER_DEAL_PM, METER_TAKE_PM, METER_CAST, METER_PARRY, METER_PERFECT_DODGE, METER_CLASH]).toEqual([800, 600, 20, 150, 100, 50]);
    expect(LEVELS.map((l) => levelFromXp(LEVEL_XP[l]))).toEqual([1, 10]);
  });
});

describe.each(LEVELS)('meter gains at level %i (level-independent)', (level) => {
  it('a full life bar dealt is 0.8 bars to the attacker and 0.6 to the victim; half is half', () => {
    for (const [share, deal, take] of [[1, 800, 600], [0.5, 400, 300], [0.25, 200, 150]] as const) {
      const world = duel('cyclonius', 'pax', level);
      const s = world.state;
      const maxHp = s.maxHp[1] ?? 0;
      meterOnHit(s, new EventSink(0), 0, 0, 1, maxHp * share);
      expect([meterOf(s, 0), meterOf(s, 1)]).toEqual([deal, take]);
    }
  });

  it('a real hit gains floor(dealt * 800 / maxHp) and floor(dealt * 600 / maxHp)', () => {
    const world = duel('cyclonius', 'pax', level);
    const s = world.state;
    const maxHp = s.maxHp[1] ?? 0;
    const before = s.hp[1] ?? 0;
    const dealt = applyArcadeHit(world, new EventSink(0), 0, 0, 1, 20, WIND_CONE, 0);
    expect(dealt).toBeCloseTo(before - (s.hp[1] ?? 0), 9);
    expect(dealt).toBeGreaterThan(0);
    expect(meterOf(s, 0)).toBe(Math.floor((dealt * 800) / maxHp));
    expect(meterOf(s, 1)).toBe(Math.floor((dealt * 600) / maxHp));
  });

  it('only the health actually removed counts: overkill caps at the remaining HP, a dead victim gives nothing', () => {
    const world = duel('cyclonius', 'pax', level);
    const s = world.state;
    s.hp[1] = (s.maxHp[1] ?? 0) / 4;
    applyArcadeHit(world, new EventSink(0), 0, 0, 1, 10_000, WIND_CONE, 0);
    expect([meterOf(s, 0), meterOf(s, 1)]).toEqual([200, 150]);
    applyArcadeHit(world, new EventSink(1), 0, 0, 1, 10_000, WIND_CONE, 0);
    expect([meterOf(s, 0), meterOf(s, 1)]).toEqual([200, 150]);
  });

  it.each([
    ['projectile', 'sindarosa', Cmd.primary],
    ['omni projectile', 'ishimi', Cmd.primary],
    ['melee', 'curomo', Cmd.primary],
    ['buff', 'pax', Cmd.primary],
    ['heal', 'fiara', Cmd.primary],
  ] as const)('each cast gives +20 (%s)', (_kind, race, cmd) => {
    const world = duel(race, 'rokcore', level);
    if (race === 'fiara') world.state.hp[0] = 10; // Fire Heal needs missing health to matter; the cast counts either way
    step(world, [cmd, 0]);
    expect([meterOf(world.state, 0), meterOf(world.state, 1)]).toEqual([METER_CAST, 0]);
    step(world, [cmd, 0]); // cooldown: no second cast, no gain
    expect(meterOf(world.state, 0)).toBe(METER_CAST);
  });
});

describe('meter bars and meterLevel', () => {
  it('caps at 3000 and emits meterLevel only when the bar count changes', () => {
    const world = duel('cyclonius', 'pax', 1);
    const s = world.state;
    const sink = new EventSink(0);
    gainMeter(s, sink, 0, 0, 990);
    expect(levels(sink.events)).toEqual([]);
    gainMeter(s, sink, 0, 0, METER_CAST);
    expect(levels(sink.events)).toEqual([{ team: 0, bars: 1 }]);
    gainMeter(s, sink, 0, 0, 999);
    gainMeter(s, sink, 0, 0, 999);
    gainMeter(s, sink, 0, 0, 999);
    expect(meterOf(s, 0)).toBe(METER_MAX);
    expect(levels(sink.events)).toEqual([{ team: 0, bars: 1 }, { team: 0, bars: 2 }, { team: 0, bars: 3 }]);
    gainMeter(s, sink, 0, 0, 800);
    gainMeter(s, sink, 0, 1, 0);
    gainMeter(s, sink, 0, 1, -5);
    expect([meterOf(s, 0), meterOf(s, 1)]).toEqual([METER_MAX, 0]);
    expect(levels(sink.events)).toHaveLength(3);
    expect([0, 999, 1000, 2999, 3000].map(meterBars)).toEqual([0, 0, 1, 2, 3]);
  });

  it('meterForDamage is zero without damage or a maximum', () => {
    expect([meterForDamage(0, 100, 800), meterForDamage(-3, 100, 800), meterForDamage(5, 0, 800), meterForDamage(5, 100, 800)])
      .toEqual([0, 0, 0, 40]);
  });

  it('Classic has no meter and emits no meterLevel on casts', () => {
    const world = duel('sindarosa', 'rokcore', 1, false);
    expect(world.state.arcade).toHaveLength(0);
    expect(levels(step(world, [Cmd.primary, Cmd.primary]))).toEqual([]);
    expect(meterOf(world.state, 0)).toBe(0);
  });
});

describe('meter properties', () => {
  const cmd = fc.integer({ min: 0, max: 0x3fff });
  const sticky = fc
    .array(fc.tuple(fc.integer({ min: 1, max: 40 }), cmd, cmd), { minLength: 1, maxLength: 12 })
    .map((runs) => runs.flatMap(([k, p, q]) => Array.from({ length: k }, (): [number, number] => [p, q])));

  it('Arcade duels: the meter stays in 0..3000, never falls (no spending before supers), meterLevel tracks the bars; replays and snapshots hash the same', () => {
    let gained = 0;
    fc.assert(
      fc.property(fc.constantFrom('sindarosa', 'curomo', 'treenoc', 'echo'), sticky, fc.nat(), (race, inputs, cut) => {
        const play = (): number[] => {
          const world = duel(race, 'wispera', 1);
          const s = world.state;
          s.x[1] = 300;
          return inputs.map(([p, q]) => {
            const before = [meterOf(s, 0), meterOf(s, 1)];
            const ev = step(world, [p, q]);
            for (const t of [0, 1]) {
              const m = meterOf(s, t);
              expect(m).toBeGreaterThanOrEqual(before[t] ?? 0);
              expect(m).toBeLessThanOrEqual(METER_MAX);
              const lv = levels(ev).filter((e) => e['team'] === t);
              if (meterBars(m) === meterBars(before[t] ?? 0)) expect(lv).toEqual([]);
              else expect(lv.at(-1)?.['bars']).toBe(meterBars(m));
              gained += m - (before[t] ?? 0);
            }
            return hash(s);
          });
        };
        const first = play();
        expect(play()).toEqual(first);
        const k = cut % inputs.length;
        const world = duel(race, 'wispera', 1);
        world.state.x[1] = 300;
        for (const [p, q] of inputs.slice(0, k)) step(world, [p, q]);
        const buf = createSnapshotBuf(world.state);
        snapshot(world.state, buf);
        for (const [p, q] of inputs.slice(k)) step(world, [p, q]);
        restore(world.state, buf);
        const again = inputs.slice(k).map(([p, q]) => {
          step(world, [p, q]);
          return hash(world.state);
        });
        expect(again).toEqual(first.slice(k));
      }),
      { numRuns: 30, seed: 0x3e7e },
    );
    expect(gained).toBeGreaterThan(0);
  });
});
