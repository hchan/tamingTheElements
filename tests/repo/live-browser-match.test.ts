import { describe, expect, it } from 'vitest';
import { parseArgs, rateLines, summarizeRuns, summaryLine } from '../../tools/live-browser-match-lib';
import { LIVE_BROWSER_MAX_RUNS } from '../../tools/live-browser-match-constants';
import { GRANT_FRAMES_PER_SEC } from '../../tools/live-match-constants';
import type { RateSummary } from '../../tools/live-rate';

const r = (total: number, mean: number, peak: number): RateSummary => ({ total, seconds: 1, peakPerSec: peak, meanPerSec: mean });

describe('live browser match helpers', () => {
  it('parses --runs, defaulting to 1 and ignoring other flags', () => {
    expect(parseArgs([])).toEqual({ runs: 1 });
    expect(parseArgs(['--mode', 'test'])).toEqual({ runs: 1 });
    expect(parseArgs(['--runs', '12'])).toEqual({ runs: 12 });
    expect(parseArgs(['--runs=3'])).toEqual({ runs: 3 });
  });
  it('rejects a bad --runs', () => {
    for (const bad of [['--runs'], ['--runs', 'x'], ['--runs', '0'], ['--runs', '1.5'], ['--runs', String(LIVE_BROWSER_MAX_RUNS + 1)]]) expect(typeof parseArgs(bad)).toBe('string');
  });
  it('summarizes run seconds (min, median, max) and labels it a measurement', () => {
    expect(summarizeRuns([30, 10, 20], 0)).toEqual({ runs: 3, failures: 0, minS: 10, medianS: 20, maxS: 30 });
    expect(summarizeRuns([10, 20, 30, 41], 1).medianS).toBe(25);
    expect(summarizeRuns([], 0).runs).toBe(0);
    expect(summaryLine(summarizeRuns([12.34], 0))).toContain('(measurement)');
  });
  it('prints per-side and total frame lines, with WARN only above the grant', () => {
    const ok = rateLines(r(300, 50, 60), r(310, 52, 60), r(610, 102, 120));
    expect(ok).toHaveLength(3);
    expect(ok.join('\n')).toContain('client A sent 300 frames');
    expect(ok.join('\n')).not.toContain('WARN');
    const mean = rateLines(r(1, 80, 80), r(1, 80, 80), r(2, GRANT_FRAMES_PER_SEC + 10, 160));
    expect(mean.at(-1)).toMatch(/^WARN: .*150\/s grant/);
    const peak = rateLines(r(1, 1, 1), r(1, 1, 1), r(2, 100, GRANT_FRAMES_PER_SEC + 1));
    expect(peak.at(-1)).toContain('WARN');
  });
});
