/**
 * Playwright reporter: one line per attempt into results.jsonl while the run goes, and a plain-language report.md at the end.
 * Pure logic lives in e2e-report.ts. Every hook catches its own errors: a reporter bug never fails a run.
 * Output dir: TTE_REPORT_DIR, else TTE_RESULTS (the PC job's out dir), else .scratch/e2e-report/latest.
 */
import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import type { FullConfig, FullResult, Reporter, Suite, TestCase, TestResult, TestStep } from '@playwright/test/reporter';
import { classify, renderMarkdown, verdict } from './e2e-report';
import type { IdeaText, KnownEntry, Outcome, RunRow } from './e2e-report';
import { loadTiers, tierOf } from './test-tiers';
import type { TierData } from './test-tiers';

const warn = (what: string, e: unknown): void => {
  process.stderr.write(`e2e-reporter: ${what}: ${e instanceof Error ? e.message : String(e)}\n`);
};
const firstLine = (s: string | undefined): string => (s ?? '').split('\n').find((l) => l.trim() !== '') ?? '';

/** Deepest failing step, else the last api/expect/test.step leaf. */
export function lastStepOf(steps: readonly TestStep[]): string {
  let failing = '';
  let leaf = '';
  const walk = (list: readonly TestStep[]): void => {
    for (const s of list) {
      const at = s.location ? ` at ${s.location.file.split('/').pop() ?? ''}:${String(s.location.line)}` : '';
      const label = `${s.title}${at}`;
      if (s.error) failing = label;
      if (['pw:api', 'expect', 'test.step'].includes(s.category) && s.steps.length === 0) leaf = label;
      walk(s.steps);
    }
  };
  walk(steps);
  return failing || leaf;
}

function ideasOpen(root: string): IdeaText[] {
  const out: IdeaText[] = [];
  const walk = (dir: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name !== 'done') walk(p);
      } else if (e.name.endsWith('.md')) out.push({ path: relative(root, p), text: readFileSync(p, 'utf8') });
    }
  };
  if (existsSync(join(root, 'ideas'))) walk(join(root, 'ideas'));
  return out;
}

function knownRed(root: string): KnownEntry[] {
  try {
    const v = JSON.parse(readFileSync(join(root, 'tools/ci/known-red.json'), 'utf8')) as { entries?: KnownEntry[] } | KnownEntry[];
    return Array.isArray(v) ? v : (v.entries ?? []);
  } catch {
    return [];
  }
}

export default class E2eReporter implements Reporter {
  private outDir = '';
  private root = process.cwd();
  private start = Date.now();
  private workers = 0;
  private retries = 0;
  private tiers: TierData | undefined;
  private suite: Suite | undefined;

  printsToStdio(): boolean {
    return false;
  }

  private dir(): string {
    if (!this.outDir) {
      const d = process.env['TTE_REPORT_DIR'] || process.env['TTE_RESULTS'] || join(this.root, '.scratch', 'e2e-report', 'latest');
      mkdirSync(d, { recursive: true });
      this.outDir = resolve(d);
    }
    return this.outDir;
  }

  private tier(file: string, title: string, tags: readonly string[]): 'P0' | 'P1' | 'P2' {
    this.tiers ??= loadTiers();
    return tierOf(file, title, tags, this.tiers);
  }

  onBegin(config: FullConfig, suite: Suite): void {
    try {
      this.suite = suite;
      this.start = Date.now();
      this.workers = config.workers;
      this.retries = config.projects[0]?.retries ?? 0;
      writeFileSync(join(this.dir(), 'results.jsonl'), '');
    } catch (e) {
      warn('onBegin', e);
    }
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    try {
      const file = relative(this.root, test.location.file);
      let tier: string = 'P1';
      try {
        tier = this.tier(file, test.title, test.tags);
      } catch (e) {
        warn('tier', e);
      }
      const attach = result.attachments.map((a) => a.path ?? '').filter(Boolean);
      const line = {
        file,
        title: test.title,
        tags: test.tags,
        tier,
        retry: result.retry,
        status: result.status,
        durationMs: result.duration,
        error: firstLine(result.error?.message),
        lastStep: lastStepOf(result.steps),
        attachments: attach,
      };
      appendFileSync(join(this.dir(), 'results.jsonl'), `${JSON.stringify(line)}\n`);
    } catch (e) {
      warn('onTestEnd', e);
    }
  }

  onEnd(result: FullResult): void {
    try {
      const dir = this.dir();
      const root = this.root;
      const tests = this.suite ? this.suite.allTests() : [];
      const rows: RunRow[] = tests.map((t) => this.rowOf(t, dir));
      const known = knownRed(root);
      const ideas = ideasOpen(root);
      const classified = rows.map((r) => classify(r, known, ideas));
      const v = verdict(classified, result.status);
      const sha = process.env['TTE_JOB_SHA'] || spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim();
      const md = renderMarkdown(
        classified,
        {
          sha,
          lane: process.env['TTE_LANE'] || 'mac',
          jobId: process.env['TTE_JOB_ID'] ?? '',
          durationMs: result.duration,
          workers: this.workers,
          retries: this.retries,
          startedAt: new Date(this.start).toISOString(),
          endedAt: new Date().toISOString(),
          status: result.status,
        },
        v,
      );
      writeFileSync(join(dir, 'report.md'), md);
    } catch (e) {
      warn('onEnd', e);
    }
  }

  private rowOf(t: TestCase, dir: string): RunRow {
    const outcome = t.outcome();
    const o: Outcome = outcome === 'skipped' ? 'skipped' : outcome === 'expected' ? 'expected' : outcome === 'flaky' ? 'flaky' : 'unexpected';
    const file = relative(this.root, t.location.file);
    const bad = [...t.results].reverse().find((r) => r.status !== 'passed' && r.status !== 'skipped') ?? t.results[t.results.length - 1];
    let tier: 'P0' | 'P1' | 'P2' = 'P1';
    try {
      tier = this.tier(file, t.title, t.tags);
    } catch (e) {
      warn('tier', e);
    }
    const attachments = bad?.attachments ?? [];
    const trace = attachments.find((a) => a.name === 'trace')?.path ?? '';
    const consoleErrors = attachments
      .filter((a) => /console|pageerror/i.test(a.name) && a.body)
      .flatMap((a) => (a.body?.toString('utf8') ?? '').split('\n').filter(Boolean));
    if (consoleErrors.length === 0 && bad?.stderr.length) consoleErrors.push(...bad.stderr.map((s) => s.toString()).join('').split('\n').filter(Boolean).slice(-10));
    return {
      file,
      line: t.location.line,
      title: t.title,
      tags: t.tags,
      tier,
      outcome: o,
      attempts: t.results.length,
      lastStep: bad ? lastStepOf(bad.steps) : '',
      error: firstLine(bad?.error?.message),
      trace: trace ? relative(dir, trace) : '',
      consoleErrors,
    };
  }
}
