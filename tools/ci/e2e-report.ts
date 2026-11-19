/**
 * Pure logic of the e2e report: classify each red, decide the verdict, render plain-language markdown.
 * No fs, no Playwright types; `tools/ci/e2e-reporter.ts` feeds it. See docs/TESTING.md "E2E report (report.md)".
 */
import { redact } from './redact';
import type { Tier } from './test-tiers';

export type Outcome = 'expected' | 'unexpected' | 'flaky' | 'skipped';
export type Status = 'flaky' | 'known' | 'new';
export type VerdictWord = 'PUSH OK' | 'HOLD' | 'BLOCKED' | 'NO VERDICT';

export interface RunRow {
  readonly file: string;
  readonly line?: number;
  readonly title: string;
  readonly tags: readonly string[];
  readonly tier: Tier;
  readonly outcome: Outcome;
  /** Attempts made (1 + retries used). */
  readonly attempts: number;
  readonly lastStep: string;
  readonly error: string;
  readonly trace: string;
  readonly consoleErrors: readonly string[];
}

export interface KnownEntry {
  readonly file: string;
  readonly titleIncludes: string;
}
export interface IdeaText {
  readonly path: string;
  readonly text: string;
}
export interface RunInfo {
  readonly sha: string;
  readonly lane: string;
  readonly jobId: string;
  readonly durationMs: number;
  readonly workers: number;
  readonly retries: number;
  readonly startedAt: string;
  readonly endedAt: string;
  /** Playwright's FullResult.status: passed, failed, timedout, interrupted. */
  readonly status: string;
}

export interface Classified {
  readonly row: RunRow;
  readonly status: Status;
  /** Which record matched (known-red.json or an ideas file), empty otherwise. */
  readonly matchedIn: string;
  /** Failed on every attempt and there was more than one attempt. */
  readonly repeating: boolean;
  /** Failed once with no retry (full lane): not yet a confirmed red. */
  readonly unconfirmed: boolean;
}

const ANSI_RE = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*[A-Za-z]`, 'g');
export const stripAnsi = (s: string): string => s.replace(ANSI_RE, '');

const base = (f: string): string => f.split('/').pop() ?? f;

/** Known match: known-red.json entry (same spec basename, title contains the substring), else a non-done ideas file naming the spec basename and the title (or its first 40 chars). */
export function knownMatch(row: RunRow, known: readonly KnownEntry[], ideas: readonly IdeaText[]): string {
  const name = base(row.file);
  if (known.some((k) => base(k.file) === name && row.title.includes(k.titleIncludes))) return 'tools/ci/known-red.json';
  const head = row.title.slice(0, 40);
  const idea = ideas.find((i) => i.text.includes(name) && (i.text.includes(row.title) || i.text.includes(head)));
  return idea ? idea.path : '';
}

export function classify(row: RunRow, known: readonly KnownEntry[], ideas: readonly IdeaText[]): Classified {
  const failed = row.outcome === 'unexpected';
  const matchedIn = failed ? knownMatch(row, known, ideas) : '';
  const status: Status = row.outcome === 'flaky' ? 'flaky' : matchedIn ? 'known' : 'new';
  return { row, status, matchedIn, repeating: failed && row.attempts >= 2, unconfirmed: failed && row.attempts < 2 };
}

export interface Verdict {
  readonly word: VerdictWord;
  readonly line: string;
}

export function verdict(rows: readonly Classified[], status: string): Verdict {
  const ran = rows.filter((c) => c.row.outcome !== 'skipped').length;
  if (status === 'interrupted' || status === 'timedout' || ran === 0) {
    return { word: 'NO VERDICT', line: 'NO VERDICT: the run did not finish or ran no tests; re-run, an unfinished run is not a verdict' };
  }
  const gating = rows.filter((c) => c.row.outcome === 'unexpected' && c.status === 'new' && c.row.tier !== 'P2');
  const rep = gating.filter((c) => c.repeating);
  if (rep.length > 0) return { word: 'BLOCKED', line: `BLOCKED: ${String(rep.length)} new repeating red(s) in P0/P1 tests; fix or revert before pushing` };
  if (gating.length > 0) return { word: 'HOLD', line: `HOLD: ${String(gating.length)} new red(s) in P0/P1 tests failed once with no retry; re-run them alone first` };
  return { word: 'PUSH OK', line: 'PUSH OK: no new repeating P0/P1 red (flaky, known and P2 reds are listed below but never block)' };
}

/** One sentence per red: what it means for the push. */
export function meaning(c: Classified): string {
  const t = c.row.tier;
  if (c.status === 'flaky') return `Passed on retry, so it is flaky: it does not block, but run the stress command to see how often it fails.`;
  if (c.status === 'known') return `Already recorded (${c.matchedIn}): not caused by this change, does not block.`;
  if (t === 'P2') return c.repeating ? 'A polish or edge test fails every time: record it as known-red; it does not block the push.' : 'A polish or edge test failed once: re-run it alone; it does not block the push.';
  const flow = t === 'P0' ? 'a core flow' : 'a feature';
  if (c.repeating) return `${t} new and repeating: ${flow} is broken by this change; fix or revert before pushing.`;
  return `${t} new but unconfirmed (failed once, no retry): re-run it alone once before deciding; if it fails again the push is blocked.`;
}

/** The command that repeats one test to see how often it fails. */
export function stressCommand(row: RunRow): string {
  const esc = row.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/'/g, `'\\''`);
  return `pnpm e2e:flake --repeat 20 --grep '${esc}' tests/e2e/${base(row.file)}`;
}

const dur = (ms: number): string => (ms >= 60000 ? `${String(Math.floor(ms / 60000))}m ${String(Math.round((ms % 60000) / 1000))}s` : `${(ms / 1000).toFixed(1)}s`);

export function renderMarkdown(rows: readonly Classified[], info: RunInfo, v: Verdict): string {
  const out: string[] = [`VERDICT: ${v.line}`, '', '# E2E report', ''];
  out.push('## Run details', '');
  out.push(`- commit: ${info.sha.slice(0, 7) || 'unknown'}`, `- lane: ${info.lane}`, `- job: ${info.jobId || 'none (local run)'}`);
  out.push(`- duration: ${dur(info.durationMs)} (started ${info.startedAt}, ended ${info.endedAt})`, `- workers: ${String(info.workers)}, retries: ${String(info.retries)}`, `- Playwright status: ${info.status}`, '');
  out.push('## Counts per tier', '', '| Tier | passed | failed | flaky | skipped |', '| --- | --- | --- | --- | --- |');
  for (const t of ['P0', 'P1', 'P2'] as const) {
    const of = rows.filter((c) => c.row.tier === t);
    const n = (o: Outcome): number => of.filter((c) => c.row.outcome === o).length;
    out.push(`| ${t} | ${String(n('expected'))} | ${String(n('unexpected'))} | ${String(n('flaky'))} | ${String(n('skipped'))} |`);
  }
  out.push('');
  const reds = rows.filter((c) => c.row.outcome === 'unexpected' || c.row.outcome === 'flaky');
  out.push(`## Reds (${String(reds.length)})`, '');
  if (reds.length === 0) out.push('None.', '');
  for (const c of reds) {
    const r = c.row;
    out.push(`### ${r.tier} ${base(r.file)}: ${redact(r.title)}`, '');
    out.push(`- file: ${r.file}${r.line === undefined ? '' : `:${String(r.line)}`}`);
    out.push(`- status: ${c.status}${c.status === 'known' ? ` (${c.matchedIn})` : ''}${c.repeating ? ', failed on every attempt' : ''}${c.unconfirmed ? ', failed once, no retry' : ''} (attempts: ${String(r.attempts)})`);
    out.push(`- last step: ${redact(r.lastStep) || 'none recorded'}`);
    out.push(`- error: ${redact(stripAnsi(r.error)) || 'none recorded'}`);
    out.push(`- trace: ${r.trace ? `${r.trace} (may be missing if the fetch size cap was hit)` : 'none'}`);
    if (r.consoleErrors.length > 0) out.push('- console/page errors:', ...r.consoleErrors.slice(0, 10).map((l) => `  - ${redact(stripAnsi(l))}`));
    out.push(`- stress it: \`${stressCommand(r)}\``);
    out.push(`- what this means: ${meaning(c)}`, '');
  }
  out.push('"new" means not listed in tools/ci/known-red.json and not named in an open ideas/ file.', '');
  return out.join('\n');
}
