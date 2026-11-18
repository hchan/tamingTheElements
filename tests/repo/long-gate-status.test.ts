import { describe, expect, it } from 'vitest';
import { applyResult, FAILING_MAX, HISTORY_MAX, validateStatus, verdict, type RunResult, type Status, type VerdictInput } from '../../tools/ci/long-gate-status';

const sha = (n: number): string => n.toString(16).padStart(40, '0');
const HEAD = sha(99);
const NOW = new Date('2026-11-18T06:00:00Z');
const fresh = '2026-11-18T01:00:00Z';
const input = (over: Partial<VerdictInput> = {}): VerdictInput => ({ now: NOW, maxAgeHours: 36, ignore: false, headSha: HEAD, isAncestor: () => true, ...over });
const run = (result: 'pass' | 'fail' | 'error', finishedAt = fresh, n = 5) => ({ sha: sha(n), result, finishedAt, runner: 'remote', failing: [], flaky: [], quarantined: [] });
const enforced = (extra: object): Status => ({ schema: 1, enforce: true, ...extra });

describe('validateStatus', () => {
  it('accepts the seed and rejects malformed files', () => {
    expect(validateStatus({ schema: 1, enforce: false }).ok).toBe(true);
    expect(validateStatus(null).ok).toBe(false);
    expect(validateStatus({ schema: 2, enforce: false }).ok).toBe(false);
    expect(validateStatus({ schema: 1, enforce: 'no' }).ok).toBe(false);
    expect(validateStatus({ schema: 1, enforce: true, lastGood: { sha: 'abc', finishedAt: fresh } }).ok).toBe(false);
    expect(validateStatus({ schema: 1, enforce: true, lastRun: { ...run('pass'), failing: new Array(51).fill({}) } }).ok).toBe(false);
  });
});

describe('verdict table', () => {
  it('ignore deploys HEAD with a warning', () => {
    const v = verdict(enforced({ lastRun: run('fail') }), input({ ignore: true }));
    expect(v).toMatchObject({ deploy: true, sha: HEAD, level: 'warning', fail: false });
  });
  it('shadow mode deploys HEAD and says what enforcement would do', () => {
    const v = verdict({ schema: 1, enforce: false, lastRun: run('fail') }, input());
    expect(v).toMatchObject({ deploy: true, sha: HEAD, level: 'warning', fail: false });
    expect(v.reason).toMatch(/would skip the deploy: last long gate run failed/);
    expect(verdict({ schema: 1, enforce: false }, input()).reason).toMatch(/not recorded/);
    const ok = verdict({ schema: 1, enforce: false, lastRun: run('pass'), lastGood: { sha: sha(5), finishedAt: fresh } }, input());
    expect(ok.reason).toMatch(/would deploy 0000000/);
  });
  it('missing or invalid file skips the deploy', () => {
    for (const raw of [undefined, 'junk', { schema: 1 }]) expect(verdict(raw, input())).toMatchObject({ deploy: false, level: 'warning', fail: false });
  });
  it('a failed last run is an error that fails the job', () => {
    expect(verdict(enforced({ lastRun: run('fail') }), input())).toMatchObject({ deploy: false, level: 'error', fail: true });
  });
  it('error and stale runs skip with a warning', () => {
    expect(verdict(enforced({ lastRun: run('error') }), input())).toMatchObject({ deploy: false, level: 'warning', fail: false });
    const stale = enforced({ lastRun: run('pass', '2026-11-16T01:00:00Z'), lastGood: { sha: sha(5), finishedAt: fresh } });
    const v = verdict(stale, input());
    expect(v).toMatchObject({ deploy: false, level: 'warning', fail: false });
    expect(v.reason).toMatch(/stale/);
  });
  it('pass and fresh deploys lastGood', () => {
    const s = enforced({ lastRun: run('pass'), lastGood: { sha: sha(5), finishedAt: fresh } });
    expect(verdict(s, input())).toMatchObject({ deploy: true, sha: sha(5), level: 'notice' });
  });
  it('lastGood not an ancestor of HEAD is an error and skips', () => {
    const s = enforced({ lastRun: run('pass'), lastGood: { sha: sha(5), finishedAt: fresh } });
    expect(verdict(s, input({ isAncestor: () => false }))).toMatchObject({ deploy: false, level: 'error' });
  });
  it('a non-hex HEAD sha is rejected', () => {
    expect(verdict({ schema: 1, enforce: false }, input({ headSha: 'main' })).deploy).toBe(false);
  });
});

describe('applyResult', () => {
  const r = (n: number, result: RunResult['result'] = 'pass'): RunResult => ({ sha: sha(n), result, finishedAt: fresh, runner: 'remote' });
  const forward = (a: string, b: string): boolean => a < b;
  it('moves lastGood forward only', () => {
    let s: Status = { schema: 1, enforce: false };
    s = applyResult(s, r(5), forward);
    expect(s.lastGood?.sha).toBe(sha(5));
    s = applyResult(s, r(3), forward);
    expect(s.lastGood?.sha).toBe(sha(5));
    s = applyResult(s, r(4, 'fail'), forward);
    expect(s.lastGood?.sha).toBe(sha(5));
    expect(s.lastRun?.result).toBe('fail');
    s = applyResult(s, r(7), forward);
    expect(s.lastGood?.sha).toBe(sha(7));
  });
  it('keeps enforce, caps history at 14 (newest first) and failing at 50', () => {
    let s: Status = { schema: 1, enforce: true };
    for (let i = 1; i <= 20; i++) s = applyResult(s, r(i), forward);
    expect(s.enforce).toBe(true);
    expect(s.history).toHaveLength(HISTORY_MAX);
    expect(s.history?.[0]?.sha).toBe(sha(20));
    const failing = Array.from({ length: 70 }, (_, i) => ({ file: 'a.spec.ts', line: i, title: 't', project: 'chromium' }));
    s = applyResult(s, { ...r(21, 'fail'), failing }, forward);
    expect(s.lastRun?.failing).toHaveLength(FAILING_MAX);
    expect(s.history?.[0]?.failed).toBe(70);
    expect(validateStatus(s).ok).toBe(true);
  });
});
