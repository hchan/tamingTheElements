// REPORT-ONLY fun gate (docs/FUN-DESIGN.md section 4, WP-arcade-tooling): it plays the Arcade PR sample and PRINTS the
// metrics, but never fails on their values: the section 4 bands are not tuned yet. Only that the tooling runs and is
// deterministic is asserted. Hard invariants (stalemate 0, caps, coverage) are added here once the targets are agreed.
import { describe, expect, it } from 'vitest';
import { formatFunReport, funReport } from '../../tools/sim/fun-report';

const OPTIONS = { ruleset: 'arcade', teamSize: 1, aiLevel: 3, seeds: 2, seed: 1, level: 1, all: false } as const;

describe('fun gate (report only)', () => {
  it('plays the Arcade sample, prints the report and re-runs identically', () => {
    const first = funReport(OPTIONS);
    console.log(`\n${formatFunReport(first)}`);
    expect(first.overall.matches).toBe(first.pairs.length * OPTIONS.seeds);
    expect(funReport(OPTIONS)).toEqual(first);
  });
});
