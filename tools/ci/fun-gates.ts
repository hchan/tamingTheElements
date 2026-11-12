// Nightly fun gates (ideas/in-progress/nightly-fun-gates.md, FUN-DESIGN WP 25 WP-arcade-gates-tight). Headless only.
//   tsx tools/ci/fun-gates.ts [--seeds 8] [--seed 1] [--team-sizes 1,2] [--out out/fun-gates.json] [--no-fail]
// Plays the Arcade fun report over ALL pairings per team size, judges it against TIGHT bands (stricter than the
// report-only bands of tools/sim/fun-report.ts) and exits 1 on any miss. Latency marks (wall ms per sim second) are
// reported and judged against a generous ceiling, as a catch for accidental perf cliffs; the sim itself stays untouched.
// Visual-state checks stay in the Playwright visual workflow (not headless sim metrics).
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { type FunReport, funReport, raceWinRates } from '../sim/fun-report';

export interface Gate {
  readonly metric: string;
  readonly min: number;
  readonly max: number;
}
export interface GateResult extends Gate {
  readonly value: number;
  readonly ok: boolean;
}

/** Bands per team size, calibrated to the measured Arcade AI (tight enough to catch regressions, loose enough not to flake). Race win rates are judged because the nightly plays every pairing. */
export function tightGates(teamSize: 1 | 2 | 3): readonly Gate[] {
  const tag = teamSize === 2;
  return [
    { metric: 'round median s', min: tag ? 50 : 30, max: tag ? 85 : 55 },
    { metric: 'time-over rate', min: 0, max: 0.1 },
    { metric: 'stalemate rate', min: 0, max: 0.01 },
    { metric: 'first hit median s', min: 0, max: 3.5 },
    { metric: 'combo median hits', min: 1, max: 4 },
    { metric: 'combo p90 hits', min: 0, max: 7 },
    { metric: 'worst race win rate', min: tag ? 0.15 : 0.3, max: 1 },
    { metric: 'best race win rate', min: 0, max: tag ? 0.85 : 0.7 },
  ];
}

export function metricValues(r: FunReport): Record<string, number> {
  const o = r.overall;
  const rates = Object.values(raceWinRates(r));
  return {
    'round median s': o.medianRoundSeconds,
    'time-over rate': o.timeOverRate,
    'stalemate rate': o.stalemateRate,
    'first hit median s': o.medianFirstHitSeconds,
    'combo median hits': o.medianComboHits,
    'combo p90 hits': o.p90ComboHits,
    // No rates (no games): NaN fails the gate rather than passing silently.
    'worst race win rate': rates.length > 0 ? Math.min(...rates) : Number.NaN,
    'best race win rate': rates.length > 0 ? Math.max(...rates) : Number.NaN,
  };
}

export function evaluateGates(values: Readonly<Record<string, number>>, gates: readonly Gate[]): GateResult[] {
  return gates.map((g) => {
    const value = values[g.metric] ?? Number.NaN;
    return { ...g, value, ok: value >= g.min && value <= g.max };
  });
}

/** Latency mark: wall milliseconds spent per simulated second (matches x median seconds approximates the sim time). */
export function latencyMark(wallMs: number, simSeconds: number): number {
  return simSeconds <= 0 ? Number.NaN : wallMs / simSeconds;
}

export const LATENCY_CEILING_MS_PER_SIM_SECOND = 50;

export function formatGates(label: string, results: readonly GateResult[]): string {
  return [
    `Fun gates, ${label}:`,
    ...results.map((b) => `  ${b.ok ? 'ok ' : 'OUT'} ${b.metric.padEnd(20)} ${String(Math.round(b.value * 1000) / 1000).padStart(7)} in [${String(b.min)}, ${String(b.max)}]`),
  ].join('\n');
}

export interface GateRun {
  readonly teamSize: 1 | 2 | 3;
  readonly results: readonly GateResult[];
  readonly msPerSimSecond: number;
  readonly latencyOk: boolean;
}

export function runGates(teamSize: 1 | 2 | 3, seeds: number, seed: number): GateRun {
  const t0 = performance.now();
  const report = funReport({ ruleset: 'arcade', teamSize, aiLevel: 3, seeds, seed, level: 1, all: true });
  const wall = performance.now() - t0;
  const simSeconds = report.overall.matches * report.overall.medianSeconds;
  const ms = latencyMark(wall, simSeconds);
  return { teamSize, results: evaluateGates(metricValues(report), tightGates(teamSize)), msPerSimSecond: ms, latencyOk: ms <= LATENCY_CEILING_MS_PER_SIM_SECOND };
}

export const gatesPass = (runs: readonly GateRun[]): boolean => runs.every((r) => r.latencyOk && r.results.every((x) => x.ok));

export function parseTeamSizes(s: string): (1 | 2 | 3)[] {
  return s.split(',').map((x) => {
    const n = Number(x);
    if (n !== 1 && n !== 2 && n !== 3) throw new Error(`bad team size: ${x}`);
    return n;
  });
}

export function main(argv: readonly string[]): number {
  try {
    const { values } = parseArgs({
      args: [...argv],
      options: { seeds: { type: 'string' }, seed: { type: 'string' }, 'team-sizes': { type: 'string' }, out: { type: 'string' }, 'no-fail': { type: 'boolean' } },
    });
    const runs = parseTeamSizes(values['team-sizes'] ?? '1,2').map((t) => runGates(t, Number(values.seeds ?? 8), Number(values.seed ?? 1)));
    for (const r of runs) {
      console.log(formatGates(`arcade ${String(r.teamSize)}v${String(r.teamSize)}`, r.results));
      console.log(`  ${r.latencyOk ? 'ok ' : 'OUT'} latency ${r.msPerSimSecond.toFixed(2)} ms per sim second (ceiling ${String(LATENCY_CEILING_MS_PER_SIM_SECOND)})`);
    }
    const out = values.out ?? 'out/fun-gates.json';
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify(runs, null, 2));
    return gatesPass(runs) || values['no-fail'] === true ? 0 : 1;
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    return 2;
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}
