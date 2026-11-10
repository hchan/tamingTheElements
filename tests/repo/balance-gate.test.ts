// PR-sample balance gate: hard invariants only, fast (a few seconds). The full tournament lives in
// tests/fixtures/balance/baseline.json and is diffed by `pnpm balance:compare` (nightly). See docs/BALANCE.md.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { collectCommands } from '../../src/core/agents/agent';
import { getCharacter } from '../../src/core/data/characters';
import { characterId } from '../../src/core/data/ids';
import { DEFAULT_SIM_FLAGS } from '../../src/core/flags';
import { createMatch } from '../../src/core/sim/match';
import { cooldownIdx } from '../../src/core/sim/state';
import { step } from '../../src/core/sim/step';
import { ARCADE_BASELINE_PATH, ARCADE_PARAMS, BASELINE_PATH, FULL_PARAMS, compareReports, type BalanceReport } from '../../tools/sim/balance';
import { DEFAULT_MAX_TICKS, RACES, makeAgent, runPairing, runTournament } from '../../tools/sim/run-match';

/** PR sample: every pairing, 2 seeds (one per side assignment), level 1, scripted vs scripted. */
const SAMPLE = { agents: ['scripted', 'scripted'], seeds: 2, seed: 1, level: 1, difficulty: 1, maxTicks: DEFAULT_MAX_TICKS } as const;

/** At most this fraction of sample matches may end as a stalemate (measured 4.5% in the full tournament). */
const MAX_STALEMATE_RATE = 0.1;

/**
 * Known legacy-numbers outliers (docs/BALANCE.md "Remaining skew"): Sindarosa wins every game (Fire Blast 67 dmg/s), Ishimi
 * loses every game (Slime Blast 7 dmg/s). They must sit at exactly 100% / 0%; any other race there is a regression.
 */
const KNOWN_OUTLIERS: Readonly<Record<string, 0 | 1>> = { sindarosa: 1, ishimi: 0 };

/** Ability ids whose cooldown was booked at least once when `race` (team 0) played `foe`. */
function castAbilities(race: string, foe: string, used: Set<string>): void {
  const world = createMatch({
    simVersion: 0, seed: 1, flags: DEFAULT_SIM_FLAGS, chapter: 1, difficulty: 1,
    p1: [{ character: characterId(race), xp: 0 }], p2: [{ character: characterId(foe), xp: 0 }],
  });
  const agents = [makeAgent('scripted', race), makeAgent('scripted', foe)] as const;
  const abilities = getCharacter(characterId(race)).abilities;
  const s = world.state;
  const last = [0, 0];
  for (let tick = 0; tick < 3000 && (s.hp[0] ?? 0) > 0 && (s.hp[1] ?? 0) > 0; tick++) {
    step(world, collectCommands(world, agents));
    for (const slot of [0, 1] as const) {
      const cd = s.abil[cooldownIdx(0, slot)] ?? 0;
      if (cd !== last[slot]) used.add(String(abilities[slot]));
      last[slot] = cd;
    }
  }
}

describe('balance PR sample', () => {
  const t = runTournament(SAMPLE);

  it('plays every pairing and no match exceeds the tick cap', () => {
    expect(t.matches).toBe((RACES.length * (RACES.length - 1) * SAMPLE.seeds) / 2);
    for (const p of t.pairs) {
      expect(p.endReasons.timeout).toBe(0);
      expect(p.meanTicks).toBeLessThanOrEqual(DEFAULT_MAX_TICKS);
    }
  });

  it('stalemates stay below the documented fraction', () => {
    const stalemates = t.pairs.reduce((n, p) => n + p.endReasons.stalemate, 0);
    expect(stalemates / t.matches).toBeLessThanOrEqual(MAX_STALEMATE_RATE);
  });

  it('is deterministic per seed', () => {
    const a = runPairing({ ...SAMPLE, a: 'fiara', b: 'curomo' });
    const b = runPairing({ ...SAMPLE, a: 'fiara', b: 'curomo' });
    expect(b.results).toEqual(a.results);
    expect(runTournament(SAMPLE)).toEqual(t);
  });

  it('no race wins 0% or 100% except the allowlisted legacy outliers', () => {
    for (const r of t.ranking) {
      const expected = KNOWN_OUTLIERS[r.race];
      if (expected !== undefined) {
        expect(r.winRate).toBe(expected);
      } else {
        expect(r.winRate).toBeGreaterThan(0);
        expect(r.winRate).toBeLessThan(1);
      }
    }
  });

  it('every ability is cast at least once across the sample', () => {
    const used = new Set<string>();
    // Ishimi dies fast against most foes, so each race plays every other race.
    for (const race of RACES) for (const foe of RACES) if (foe !== race) castAbilities(race, foe, used);
    const all = RACES.flatMap((r) => getCharacter(characterId(r)).abilities.slice(0, 2).map(String));
    expect(all.filter((a) => !used.has(a))).toEqual([]);
  });
});

describe('balance baseline', () => {
  const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as BalanceReport;
  const withRates = (rates: Record<string, number>): BalanceReport => ({ ...baseline, winRates: rates });

  it('covers every race with more seeds per pairing than the PR sample', () => {
    expect(Object.keys(baseline.winRates).sort()).toEqual([...RACES].sort());
    expect(baseline.params.seeds).toBeGreaterThan(SAMPLE.seeds);
  });

  it('compareReports flags a move beyond the tolerance and a missing race', () => {
    expect(compareReports(baseline, baseline).some((r) => r.exceeds)).toBe(false);
    const moved = { ...baseline.winRates, fiara: (baseline.winRates['fiara'] ?? 0) + 0.06 };
    expect(compareReports(baseline, withRates(moved)).find((r) => r.race === 'fiara')?.exceeds).toBe(true);
    const rest = Object.fromEntries(Object.entries(baseline.winRates).filter(([k]) => k !== 'fiara'));
    expect(compareReports(baseline, withRates(rest)).find((r) => r.race === 'fiara')?.exceeds).toBe(true);
  });
});

describe('Arcade balance baseline (WP-arcade-numbers; compared nightly, report only)', () => {
  const arcade = JSON.parse(readFileSync(ARCADE_BASELINE_PATH, 'utf8')) as BalanceReport;

  it('is the Arcade round robin over every race, with its own parameters', () => {
    expect(arcade.params).toEqual(ARCADE_PARAMS);
    expect(Object.keys(arcade.winRates).sort()).toEqual([...RACES].sort());
    expect(arcade.matches).toBe((RACES.length * (RACES.length - 1) * ARCADE_PARAMS.seeds) / 2);
  });

  it('leaves the Classic parameters alone (Classic stays bit-identical)', () => {
    expect(FULL_PARAMS).not.toHaveProperty('ruleset');
    const classic = JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as BalanceReport;
    expect(classic.params).toEqual(FULL_PARAMS);
  });
});
