// Pure helpers for tools/live-browser-match.ts (argument parsing, run summary, frame-rate report); no browser, no network, tested in tests/repo.
import { GRANT_FRAMES_PER_SEC } from './live-match-constants';
import { LIVE_BROWSER_DEFAULT_RUNS, LIVE_BROWSER_MAX_RUNS } from './live-browser-match-constants';
import type { RateSummary } from './live-rate';

export interface BrowserArgs { readonly runs: number }

/** `--runs N` (or `--runs=N`), a whole number in 1..LIVE_BROWSER_MAX_RUNS; anything else is a bad-config error string. Other flags are ignored. */
export function parseArgs(argv: readonly string[]): BrowserArgs | string {
  let runs = LIVE_BROWSER_DEFAULT_RUNS;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] ?? '';
    let v: string | undefined;
    if (a === '--runs') { v = argv[++i]; } else if (a.startsWith('--runs=')) { v = a.slice(7); } else { continue; }
    if (v === undefined || !/^\d+$/.test(v)) return '--runs needs a whole number';
    runs = Number(v);
    if (runs < 1 || runs > LIVE_BROWSER_MAX_RUNS) return `--runs must be 1..${String(LIVE_BROWSER_MAX_RUNS)}`;
  }
  return { runs };
}

export interface RunsSummary { readonly runs: number; readonly failures: number; readonly minS: number; readonly medianS: number; readonly maxS: number }

/** Wall seconds per run (one decimal); median of an even count is the mean of the middle two. */
export function summarizeRuns(secondsPerRun: readonly number[], failures: number): RunsSummary {
  const s = [...secondsPerRun].sort((x, y) => x - y);
  const r1 = (n: number): number => Math.round(n * 10) / 10;
  if (s.length === 0) return { runs: 0, failures, minS: 0, medianS: 0, maxS: 0 };
  const mid = s.length >> 1;
  const med = s.length % 2 === 1 ? (s[mid] ?? 0) : ((s[mid - 1] ?? 0) + (s[mid] ?? 0)) / 2;
  return { runs: s.length, failures, minS: r1(s[0] ?? 0), medianS: r1(med), maxS: r1(s[s.length - 1] ?? 0) };
}

export const summaryLine = (m: RunsSummary): string =>
  `== summary: ${String(m.runs)} runs, ${String(m.failures)} failures, seconds min ${String(m.minS)} / median ${String(m.medianS)} / max ${String(m.maxS)} (measurement)`;

/** Per-side and combined client-sent frame lines, plus a WARN line when the combined rate passes the grant. */
export function rateLines(a: RateSummary, b: RateSummary, total: RateSummary, grant: number = GRANT_FRAMES_PER_SEC): string[] {
  const side = (n: string, r: RateSummary): string => `  client ${n} sent ${String(r.total)} frames, ${String(r.meanPerSec)}/s mean, ${String(r.peakPerSec)}/s peak (measurement)`;
  const lines = [side('A', a), side('B', b), `  total sent ${String(total.total)} frames, ${String(total.meanPerSec)}/s mean, ${String(total.peakPerSec)}/s peak vs grant ${String(grant)}/s (measurement)`];
  if (total.meanPerSec > grant || total.peakPerSec > grant) {
    lines.push(`WARN: combined client-sent rate (mean ${String(total.meanPerSec)}/s, peak ${String(total.peakPerSec)}/s) exceeds the ${String(grant)}/s grant`);
  }
  return lines;
}
