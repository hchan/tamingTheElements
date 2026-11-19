import { describe, expect, it } from 'vitest';
import { classify, knownMatch, meaning, renderMarkdown, stressCommand, verdict } from '../../tools/ci/e2e-report';
import type { RunInfo, RunRow } from '../../tools/ci/e2e-report';

const row = (o: Partial<RunRow> = {}): RunRow => ({
  file: 'tests/e2e/menu.spec.ts', line: 12, title: 'opens the menu', tags: [], tier: 'P1', outcome: 'unexpected', attempts: 2,
  lastStep: 'waiting on: click at menu.spec.ts:14', error: 'Error: expected 1 got 2', trace: 'test-results/a/trace.zip', consoleErrors: [], ...o,
});
const info: RunInfo = { sha: 'abcdef0123', lane: 'short', jobId: 'j1', durationMs: 65000, workers: 2, retries: 1, startedAt: 's', endedAt: 'e', status: 'failed' };
const cls = (rows: RunRow[], known: { file: string; titleIncludes: string }[] = []) => rows.map((r) => classify(r, known, []));

describe('verdict', () => {
  it('P0 new repeating -> BLOCKED', () => { expect(verdict(cls([row({ tier: 'P0' })]), 'failed').word).toBe('BLOCKED'); });
  it('P1 flaky -> PUSH OK', () => { expect(verdict(cls([row({ outcome: 'flaky' })]), 'passed').word).toBe('PUSH OK'); });
  it('P2 new repeating -> PUSH OK', () => { expect(verdict(cls([row({ tier: 'P2' })]), 'failed').word).toBe('PUSH OK'); });
  it('P0 known -> PUSH OK', () => {
    const k = [{ file: 'menu.spec.ts', titleIncludes: 'opens' }];
    expect(verdict(cls([row({ tier: 'P0' })], k), 'failed').word).toBe('PUSH OK');
  });
  it('single attempt (full lane) -> HOLD', () => { expect(verdict(cls([row({ attempts: 1 })]), 'failed').word).toBe('HOLD'); });
  it('interrupted or empty -> NO VERDICT', () => {
    expect(verdict(cls([row({ outcome: 'expected' })]), 'interrupted').word).toBe('NO VERDICT');
    expect(verdict([], 'passed').word).toBe('NO VERDICT');
  });
});

describe('known matching', () => {
  it('matches known-red by basename and title substring', () => {
    expect(knownMatch(row(), [{ file: 'menu.spec.ts', titleIncludes: 'menu' }], [])).toBe('tools/ci/known-red.json');
    expect(knownMatch(row(), [{ file: 'other.spec.ts', titleIncludes: 'menu' }], [])).toBe('');
  });
  it('matches an ideas file naming spec and title', () => {
    const ideas = [{ path: 'ideas/brainstorm/x.md', text: 'menu.spec.ts opens the menu is red' }];
    expect(knownMatch(row(), [], ideas)).toBe('ideas/brainstorm/x.md');
    expect(knownMatch(row({ title: 'other' }), [], ideas)).toBe('');
  });
});

describe('markdown', () => {
  it('starts with the VERDICT line and lists tiers and run details', () => {
    const c = cls([row(), row({ outcome: 'expected', title: 'ok', tier: 'P0' })]);
    const md = renderMarkdown(c, info, verdict(c, 'failed'));
    expect(md.split('\n')[0]).toMatch(/^VERDICT: HOLD|^VERDICT: BLOCKED/);
    expect(md).toContain('- commit: abcdef0');
    expect(md).toContain('| P0 | 1 | 0 | 0 | 0 |');
    expect(md).toContain('what this means:');
  });
  it('quotes the stress command for titles with quotes and regex characters', () => {
    expect(stressCommand(row({ title: "it's (a) test" }))).toBe(`pnpm e2e:flake --repeat 20 --grep 'it'\\''s \\(a\\) test' tests/e2e/menu.spec.ts`);
  });
  it('redacts addresses and strips ANSI in the error', () => {
    const e = `${String.fromCharCode(27)}[31mfail at 10.1.2.3 in /Users/bob/x${String.fromCharCode(27)}[0m`;
    const c = cls([row({ error: e })]);
    const md = renderMarkdown(c, info, verdict(c, 'failed'));
    expect(md).toContain('fail at <addr> in ~/x');
    expect(md).not.toContain('bob');
  });
  it('meaning is plain for each case', () => {
    expect(meaning(classify(row({ tier: 'P0' }), [], []))).toContain('fix or revert');
    expect(meaning(classify(row({ outcome: 'flaky' }), [], []))).toContain('flaky');
  });
});
