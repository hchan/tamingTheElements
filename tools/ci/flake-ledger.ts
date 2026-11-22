// Flake ledger: merges `e2e-flake.ts --summary-json` outputs into per-test {runs, passes, lastRun, p90Ms}, kept in
// tools/ci/flake-ledger.json (committed, small). `tsx tools/ci/flake-ledger.ts merge <summary.json...>` updates it.
// Pure functions are exported; only main() touches the disk and the clock. Used by flake-hunt.ts to pick slices.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

export interface SummaryRow {
  key: string;
  runs: number;
  passes: number;
  p90Ms: number;
}
export interface LedgerEntry {
  runs: number;
  passes: number;
  lastRun: string;
  p90Ms: number;
}
export type Ledger = Record<string, LedgerEntry>;

export const LEDGER_PATH = 'tools/ci/flake-ledger.json';

/** Adds summary rows to a ledger (returns a new one): runs and passes accumulate, lastRun is `now`, p90Ms is the latest non-zero value. */
export function mergeSummary(ledger: Ledger, rows: readonly SummaryRow[], now: string): Ledger {
  const out: Ledger = { ...ledger };
  for (const r of rows) {
    if (r.runs <= 0) continue;
    const prev = out[r.key];
    out[r.key] = {
      runs: (prev?.runs ?? 0) + r.runs,
      passes: (prev?.passes ?? 0) + r.passes,
      lastRun: now,
      p90Ms: r.p90Ms > 0 ? r.p90Ms : (prev?.p90Ms ?? 0),
    };
  }
  return out;
}

/** The spec file of a ledger key (`file: title`). */
export function specOf(key: string): string {
  const i = key.indexOf(': ');
  return i < 0 ? key : key.slice(0, i);
}

export interface SpecStat {
  spec: string;
  runs: number;
  passes: number;
  p90Ms: number;
}

/** Per-spec-file roll-up: runs and passes summed, p90Ms the sum of the tests' p90 (one pass over the file). */
export function rollUp(ledger: Ledger): SpecStat[] {
  const m = new Map<string, SpecStat>();
  for (const [key, e] of Object.entries(ledger)) {
    const spec = specOf(key);
    const s = m.get(spec) ?? { spec, runs: 0, passes: 0, p90Ms: 0 };
    s.runs += e.runs;
    s.passes += e.passes;
    s.p90Ms += e.p90Ms;
    m.set(spec, s);
  }
  return [...m.values()];
}

function main(): void {
  const [cmd, ...files] = process.argv.slice(2);
  if (cmd !== 'merge' || files.length === 0) throw new Error('usage: flake-ledger.ts merge <summary.json...>');
  let ledger: Ledger = existsSync(LEDGER_PATH) ? (JSON.parse(readFileSync(LEDGER_PATH, 'utf8')) as Ledger) : {};
  const now = new Date().toISOString();
  for (const f of files) ledger = mergeSummary(ledger, JSON.parse(readFileSync(f, 'utf8')) as SummaryRow[], now);
  const sorted = Object.fromEntries(Object.entries(ledger).sort(([a], [b]) => (a < b ? -1 : 1)));
  writeFileSync(LEDGER_PATH, `${JSON.stringify(sorted, null, 2)}\n`);
  process.stdout.write(`ledger: ${String(Object.keys(sorted).length)} tests\n`);
}

if (process.argv[1]?.endsWith('flake-ledger.ts')) main();
