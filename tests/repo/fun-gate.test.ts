// REPORT-ONLY fun gate (docs/FUN-DESIGN.md section 4, WP-arcade-tooling): it plays the Arcade PR sample and PRINTS the
// metrics, but never fails on their values: the section 4 bands are not tuned yet. Only that the tooling runs and is
// deterministic is asserted, plus super and combo coverage. The other hard invariants (stalemate 0, caps) are added here
// once the targets are agreed.
import { describe, expect, it } from 'vitest';
import { formatFunReport, funBands, funReport, raceWinRates } from '../../tools/sim/fun-report';
import { RACES } from '../../tools/sim/run-match';

const OPTIONS = { ruleset: 'arcade', teamSize: 1, aiLevel: 3, seeds: 2, seed: 1, level: 1, all: false } as const;

describe('fun gate (report only)', () => {
  it('plays the Arcade sample, prints the report and re-runs identically', () => {
    const first = funReport(OPTIONS);
    console.log(`\n${formatFunReport(first)}`);
    expect(first.overall.matches).toBe(first.pairs.length * OPTIONS.seeds);
    expect(funReport(OPTIONS)).toEqual(first);
  });

  it('coverage: the Arcade AI uses supers and lands combos longer than 1 hit (WP-arcade-ai-basic)', () => {
    const { overall } = funReport(OPTIONS);
    expect(overall.supers).toBeGreaterThan(0);
    expect(overall.maxComboHits).toBeGreaterThan(1);
  });

  it('reports per-race win rates and the WP-arcade-numbers bands without judging them (report only)', () => {
    const report = funReport(OPTIONS);
    const rates = raceWinRates(report);
    expect(Object.keys(rates)).toEqual([...RACES]);
    // Each race plays two pairings of OPTIONS.seeds games; the rates of a round robin average one half.
    const sum = Object.values(rates).reduce((x, y) => x + y, 0);
    expect(sum / RACES.length).toBeCloseTo(0.5, 2);
    const bands = funBands(report);
    expect(bands.map((b) => b.metric)).toContain('combo median hits');
    // The sample is not a round robin, so the race bands are only judged with --all.
    expect(bands.some((b) => b.metric.includes('race'))).toBe(false);
    for (const b of bands) expect(b.ok).toBe(b.value >= b.min && b.value <= b.max);
  });
});

describe('Arcade 2v2 fun report (WP-arcade-2v2-tune, report only)', () => {
  const TAG = { ruleset: 'arcade', teamSize: 2, aiLevel: 3, seeds: 1, seed: 1, level: 1, all: false } as const;

  it('plays the tag-team sample deterministically, tags, finishes its rounds and uses the 2v2 round band', () => {
    const report = funReport(TAG);
    console.log(`\n${formatFunReport(report)}`);
    expect(funReport(TAG)).toEqual(report);
    expect(report.overall.matches).toBe(report.pairs.length * TAG.seeds);
    expect(report.overall.tags).toBeGreaterThan(0);
    // The 2v2 tune made rounds end: the old 67% time-over would fail this, a single sample seed stays well inside it.
    expect(report.overall.timeOverRate).toBeLessThan(0.5);
    const round = funBands(report).find((b) => b.metric === 'round median s');
    expect([round?.min, round?.max]).toEqual([45, 90]);
  });
});
