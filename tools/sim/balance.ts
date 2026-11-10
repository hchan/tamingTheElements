// Balance regression gate (`pnpm balance:compare`, `pnpm balance:record`). Node only; see docs/BALANCE.md.
// Runs the full scripted-vs-scripted tournament, reduces it to a small report and diffs it against the committed baseline.
// `--ruleset arcade` plays the Arcade tournament (ARCADE_PARAMS) against its own baseline (ARCADE_BASELINE_PATH).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { ARCADE_MAX_TICKS, DEFAULT_MAX_TICKS, runTournament, type TournamentSummary } from './run-match';

/** Parameters of the full tournament recorded in the baseline. Changing them means re-recording the baseline. */
export const FULL_PARAMS = {
  agents: ['scripted', 'scripted'],
  seeds: 16,
  seed: 1,
  level: 1,
  difficulty: 1,
  maxTicks: DEFAULT_MAX_TICKS,
} as const;

/**
 * The Arcade tournament (FUN-DESIGN 2.13, WP-arcade-numbers): the same round robin under `rulesetArcade`, the Arcade AI
 * at Normal (`aiLevel` 3) with its personality drawn per match, so every race meets every personality.
 */
export const ARCADE_PARAMS = { ...FULL_PARAMS, maxTicks: ARCADE_MAX_TICKS, ruleset: 'arcade', aiLevel: 3 } as const;

export type BalanceParams = typeof FULL_PARAMS | typeof ARCADE_PARAMS;

/** A race may move by at most this much (absolute, 0.05 = 5 percentage points) before the compare fails. */
export const DEFAULT_TOLERANCE = 0.05;

export const BASELINE_PATH = 'tests/fixtures/balance/baseline.json';
export const ARCADE_BASELINE_PATH = 'tests/fixtures/balance/arcade-baseline.json';

export interface BalanceReport {
  readonly params: BalanceParams;
  readonly matches: number;
  readonly stalemates: number;
  readonly timeouts: number;
  /** Per-race tournament win rate (draws count half), sorted by race id. */
  readonly winRates: Readonly<Record<string, number>>;
}

export function toReport(t: TournamentSummary, params: BalanceParams = FULL_PARAMS): BalanceReport {
  const winRates = Object.fromEntries(
    [...t.ranking].sort((x, y) => x.race.localeCompare(y.race)).map((r) => [r.race, r.winRate]),
  );
  return {
    params,
    matches: t.matches,
    stalemates: t.pairs.reduce((n, p) => n + p.endReasons.stalemate, 0),
    timeouts: t.pairs.reduce((n, p) => n + p.endReasons.timeout, 0),
    winRates,
  };
}

export interface RaceDelta {
  readonly race: string;
  readonly baseline: number;
  readonly current: number;
  readonly delta: number;
  readonly exceeds: boolean;
}

export function compareReports(base: BalanceReport, cur: BalanceReport, tolerance = DEFAULT_TOLERANCE): RaceDelta[] {
  const races = [...new Set([...Object.keys(base.winRates), ...Object.keys(cur.winRates)])].sort();
  return races.map((race) => {
    const b = base.winRates[race];
    const c = cur.winRates[race];
    // A race present on only one side is always a failure.
    const delta = b === undefined || c === undefined ? Number.NaN : Math.round((c - b) * 1000) / 1000;
    return {
      race,
      baseline: b ?? Number.NaN,
      current: c ?? Number.NaN,
      delta,
      exceeds: Number.isNaN(delta) || Math.abs(delta) > tolerance + 1e-9,
    };
  });
}

const pct = (x: number): string => (Number.isNaN(x) ? 'n/a' : `${(x * 100).toFixed(1)}%`);

export function formatDeltas(rows: readonly RaceDelta[], tolerance: number): string {
  const lines = rows.map((r) => {
    const d = Number.isNaN(r.delta) ? 'n/a' : `${r.delta >= 0 ? '+' : ''}${(r.delta * 100).toFixed(1)}pp`;
    return `${r.race.padEnd(12)}${pct(r.baseline).padStart(8)}${pct(r.current).padStart(8)}${d.padStart(9)}${r.exceeds ? '  FAIL' : ''}`;
  });
  const head = `${'race'.padEnd(12)}${'base'.padStart(8)}${'now'.padStart(8)}${'delta'.padStart(9)}  (tolerance ${(tolerance * 100).toFixed(1)}pp)`;
  return [head, ...lines].join('\n');
}

export function main(argv: readonly string[]): number {
  try {
    const { values } = parseArgs({
      args: [...argv],
      options: {
        record: { type: 'boolean' }, out: { type: 'string' }, baseline: { type: 'string' }, tolerance: { type: 'string' },
        ruleset: { type: 'string' },
      },
    });
    if (values.ruleset !== undefined && values.ruleset !== 'classic' && values.ruleset !== 'arcade') {
      throw new Error(`--ruleset must be classic|arcade, got "${values.ruleset}"`);
    }
    const arcade = values.ruleset === 'arcade';
    const params = arcade ? ARCADE_PARAMS : FULL_PARAMS;
    const baselinePath = values.baseline ?? (arcade ? ARCADE_BASELINE_PATH : BASELINE_PATH);
    const tolerance = values.tolerance === undefined ? DEFAULT_TOLERANCE : Number(values.tolerance);
    if (!Number.isFinite(tolerance) || tolerance < 0) throw new Error('--tolerance must be a non-negative number');
    const current = toReport(runTournament(params), params);
    if (values.record === true) {
      mkdirSync(dirname(baselinePath), { recursive: true });
      writeFileSync(baselinePath, `${JSON.stringify(current, null, 2)}\n`);
      console.log(`recorded ${baselinePath} (${String(current.matches)} matches)`);
      return 0;
    }
    const base = JSON.parse(readFileSync(baselinePath, 'utf8')) as BalanceReport;
    const rows = compareReports(base, current, tolerance);
    const failed = rows.some((r) => r.exceeds);
    console.log(formatDeltas(rows, tolerance));
    console.log(
      `stalemates ${String(base.stalemates)} -> ${String(current.stalemates)}, timeouts ${String(base.timeouts)} -> ${String(current.timeouts)}`,
    );
    if (values.out !== undefined) {
      mkdirSync(dirname(values.out), { recursive: true });
      writeFileSync(values.out, `${JSON.stringify({ tolerance, failed, baseline: base, current, deltas: rows }, null, 2)}\n`);
    }
    if (failed) {
      const record = `pnpm balance:record${arcade ? ' --ruleset arcade' : ''}`;
      console.error(`Balance moved beyond tolerance. If intended, run \`${record}\` and say why in the commit.`);
    }
    return failed ? 1 : 0;
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    console.error('usage: pnpm balance:compare [--ruleset classic|arcade] [--out report.json] [--tolerance 0.05] | pnpm balance:record [--ruleset classic|arcade]');
    return 2;
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}
