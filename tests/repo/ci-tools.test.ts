import { describe, expect, it } from 'vitest';
import { assertCleanTree, assertPagesBranch, assertPushed, commitMessage, parseCliArgs as parseDeploy, pushArgs } from '../../tools/ci/deploy-pages';
import { exitCodeFor, formatSummary, parseCliArgs as parseCi, planSteps } from '../../tools/ci/local-ci';

describe('ci:local', () => {
  it('parses --fast and rejects unknown args', () => {
    expect(parseCi([])).toEqual({ fast: false });
    expect(parseCi(['--fast'])).toEqual({ fast: true });
    expect(() => parseCi(['--nope'])).toThrow(/Unknown argument/);
  });

  it('fast mode runs no browsers and says so', () => {
    const { run, skipped } = planSteps({ fast: true });
    expect(run.map((s) => s.name)).toEqual(['lint', 'typecheck', 'depcruise', 'test', 'test:legacy', 'build', 'size:check']);
    expect(skipped.every((s) => s.status === 'skip' && s.note.includes('--fast'))).toBe(true);
  });

  it('full mode runs e2e and only launchable engines, reporting the rest as skipped', () => {
    const { run, skipped } = planSteps({ fast: false }, new Set(['chromium']));
    const names = run.map((s) => s.name);
    expect(names).toContain('e2e:pages');
    expect(names).toContain('test:browser (chromium)');
    expect(names).not.toContain('test:browser (firefox)');
    expect(skipped.map((s) => s.name)).toEqual(['test:browser (firefox)', 'test:browser (webkit)']);
  });

  it('exits non-zero only when a step failed', () => {
    const ok = { name: 'a', status: 'pass', seconds: 1, note: '' } as const;
    expect(exitCodeFor([ok, { ...ok, status: 'skip' }])).toBe(0);
    expect(exitCodeFor([ok, { ...ok, status: 'fail' }])).toBe(1);
    expect(formatSummary([ok])).toContain('PASS');
  });
});

describe('deploy:pages', () => {
  it('parses --dry-run', () => {
    expect(parseDeploy([])).toEqual({ dryRun: false, branch: 'gh-pages' });
    expect(parseDeploy(['--dry-run']).dryRun).toBe(true);
    expect(() => parseDeploy(['--bogus'])).toThrow(/Unknown argument/);
  });

  it('refuses any target other than gh-pages', () => {
    expect(() => parseDeploy(['--branch', 'main'])).toThrow(/Refusing/);
    expect(() => parseDeploy(['--branch=master'])).toThrow(/Refusing/);
    expect(() => { assertPagesBranch(''); }).toThrow(/Refusing/);
    expect(() => pushArgs('main')).toThrow(/Refusing/);
    expect(pushArgs('gh-pages')).toEqual(['push', '--force', 'origin', 'HEAD:gh-pages']);
  });

  it('refuses a dirty tree and an unpushed HEAD', () => {
    expect(() => { assertCleanTree(' M src/x.ts\n'); }).toThrow(/dirty/);
    expect(() => { assertCleanTree('?? new.txt'); }).toThrow(/dirty/);
    expect(() => { assertCleanTree(''); }).not.toThrow();
    expect(() => { assertPushed(false); }).toThrow(/not pushed/);
    expect(() => { assertPushed(true); }).not.toThrow();
  });

  it('formats the commit message', () => {
    expect(commitMessage('abc1234', '0.1.0')).toBe('Deploy abc1234 (0.1.0)');
  });
});
