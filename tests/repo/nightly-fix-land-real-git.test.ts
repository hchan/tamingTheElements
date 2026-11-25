/**
 * tools/ci/nightly-fix-land.ts (integrateMain, pushMerged, keepMerged) against REAL git: a bare repo stands in for origin, a clone for
 * the main checkout, `<root>/fix` for the fix worktree (F on the tested sha T) and `<root>/mergewt` for the merge worktree
 * (M = `merge --no-ff F` on T). Only the clock and gh are fake (gh is recorded, never run). No network, no real remote.
 * The 11 cases follow the WP3 plan section 7.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { integrateMain, keepMerged, pushMerged, type LandDeps, type PushGreens } from '../../tools/ci/nightly-fix-land';
import { DISPATCH_PAGES_ARGS, pushArgsFor } from '../../tools/ci/nightly-push';

const IDENT = ['-c', 'user.name=Rehearsal', '-c', 'user.email=rehearsal@example.invalid', '-c', 'commit.gpgsign=false'];
const START = new Date(2026, 10, 25, 1, 0, 0);
const LATE = new Date(2026, 10, 25, 7, 30, 0);
const DATE = '2026-11-25';
const GREEN: PushGreens = { sameSpecsGreen: true, gateCommitOk: true, collateralOk: true, mergeOk: true };

interface Call {
  cmd: string;
  args: readonly string[];
  cwd: string;
}

describe('nightly-fix-land with real git (bare origin, clone, fix worktree, merge worktree)', () => {
  let root: string;
  let origin: string;
  let clone: string;
  let calls: Call[];
  let out: string;
  let now: Date;
  let envExtra: Record<string, string>;
  let interceptPush: (() => void) | undefined;
  const env = (): Record<string, string> => ({ PATH: process.env.PATH ?? '', HOME: root, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0', ...envExtra });
  const git = (cwd: string, ...a: string[]): string => execFileSync('git', [...IDENT, ...a], { cwd, env: env(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const commit = (cwd: string, file: string, text = `${file}\n`): string => {
    mkdirSync(dirname(join(cwd, file)), { recursive: true });
    writeFileSync(join(cwd, file), text);
    git(cwd, 'add', file);
    git(cwd, 'commit', '-q', '-m', file);
    return git(cwd, 'rev-parse', 'HEAD');
  };
  const originMain = (): string => git(origin, 'rev-parse', 'refs/heads/main');
  const mainSha = (): string => git(clone, 'rev-parse', 'refs/heads/main');

  const deps = (): LandDeps => ({
    env: env(),
    repo: clone,
    statusDir: join(root, 'status'),
    now: () => now,
    out: (s) => {
      out += s;
    },
    run: (cmd, args, cwd, e) => {
      calls.push({ cmd, args, cwd });
      if (cmd === 'gh') return { code: 0, stdout: '', stderr: '' }; // recorded, never run
      if (cmd === 'git' && args[0] === 'push') interceptPush?.();
      try {
        return { code: 0, stdout: execFileSync(cmd, args, { cwd, env: e, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }), stderr: '' };
      } catch (err) {
        const x = err as { status?: number; stdout?: string; stderr?: string };
        return { code: x.status ?? 1, stdout: x.stdout ?? '', stderr: x.stderr ?? '' };
      }
    },
  });
  const pushes = (): Call[] => calls.filter((c) => c.cmd === 'git' && c.args[0] === 'push');
  const merges = (): Call[] => calls.filter((c) => c.cmd === 'git' && c.args.includes('merge'));
  const refuses = (r: { how: string; refusals: readonly string[] }, re: RegExp): void => {
    expect(r.how).toBe('refused');
    expect(r.refusals.join(' | ')).toMatch(re);
  };

  /** T = tested commit on main (not yet on origin). F = fix commit(s) in the fix worktree. M = merge --no-ff F on T in the merge worktree. */
  const build = (fixFile = 'src/fixed.ts', fixText?: string): { t: string; f: string; m: string } => {
    const t = commit(clone, 'tested.txt');
    const fix = join(root, 'fix');
    const mw = join(root, 'mergewt');
    git(clone, 'worktree', 'add', '-q', '-b', 'nightly-fix/test', fix, t);
    const f = commit(fix, fixFile, fixText);
    git(clone, 'worktree', 'add', '-q', '-b', 'nightly-fix/test-merge-1', mw, t);
    git(mw, 'merge', '-q', '--no-ff', '-m', 'merge fixes', f);
    const m = git(mw, 'rev-parse', 'HEAD');
    expect(git(mw, 'rev-parse', 'HEAD^1')).toBe(t);
    expect(git(mw, 'rev-parse', 'HEAD^2')).toBe(f);
    return { t, f, m };
  };

  beforeEach(() => {
    mkdirSync(resolve('.scratch'), { recursive: true });
    root = mkdtempSync(join(resolve('.scratch'), 'fix-land-')); // worktree .scratch, not the system temp
    origin = join(root, 'origin.git');
    clone = join(root, 'clone');
    calls = [];
    out = '';
    now = START;
    envExtra = {};
    interceptPush = undefined;
    git(root, 'init', '-q', '--bare', '-b', 'main', origin);
    git(root, 'clone', '-q', origin, clone);
    git(clone, 'checkout', '-q', '-B', 'main');
    git(clone, 'config', 'user.name', 'Rehearsal');
    git(clone, 'config', 'user.email', 'rehearsal@example.invalid');
    git(clone, 'config', 'commit.gpgsign', 'false');
    commit(clone, 'base.txt');
    git(clone, 'push', '-q', 'origin', 'main');
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('1. main == T: fast-forward, N == M, origin == M with exactly pushArgsFor(M) from the clone, then dispatches Pages', () => {
    const { m } = build();
    const r = integrateMain(deps(), m, git(clone, 'rev-parse', 'HEAD'), DATE, START.getTime());
    expect(r.refusals).toEqual([]);
    expect(r.how).toBe('ff');
    expect(r.postFailures).toEqual([]);
    expect(mainSha()).toBe(m);
    expect(r.changed).toEqual(['src/fixed.ts']);
    const p = pushMerged(deps(), m, START.getTime(), GREEN);
    expect(p).toMatchObject({ pushed: true, alreadyOnOrigin: true, blockers: [], dispatched: true });
    expect(originMain()).toBe(m);
    expect(pushes()).toHaveLength(1);
    expect(pushes()[0]?.args).toEqual(pushArgsFor(m));
    expect(pushes()[0]?.args.join(' ')).not.toMatch(/--force|-f\b|--force-with-lease|\+/);
    expect(pushes()[0]?.cwd).toBe(clone);
    expect(calls.filter((c) => c.cmd === 'gh').map((c) => c.args)).toEqual([DISPATCH_PAGES_ARGS]);
  });

  it('2. U on main: --no-ff merge keeps U (parents U, M); origin gets M, not the merge', () => {
    const { m } = build();
    const u = commit(clone, 'local-only.txt');
    const r = integrateMain(deps(), m, git(clone, 'rev-parse', 'HEAD~1'), DATE, START.getTime());
    expect(r.how).toBe('merge');
    expect(r.postFailures).toEqual([]);
    const n = mainSha();
    expect(n).not.toBe(m);
    expect(git(clone, 'rev-parse', `${n}^1`)).toBe(u);
    expect(git(clone, 'rev-parse', `${n}^2`)).toBe(m);
    expect(git(clone, 'log', '-1', '--format=%s', n)).toBe(`Merge nightly fixes ${DATE} (nightly-fix)`);
    const p = pushMerged(deps(), m, START.getTime(), GREEN);
    expect(p.pushed).toBe(true);
    expect(originMain()).toBe(m);
    expect(originMain()).not.toBe(n);
  });

  it('3. dirty main (unstaged, then staged): bytes untouched, main unmoved, merged branch kept (-2 on a second night), nothing pushed', () => {
    const { t, m } = build();
    for (const stage of [false, true]) {
      writeFileSync(join(clone, 'base.txt'), `dirty ${String(stage)}\n`);
      if (stage) git(clone, 'add', 'base.txt');
      const r = integrateMain(deps(), m, t, DATE, START.getTime());
      refuses(r, /uncommitted tracked changes/);
      expect(mainSha()).toBe(t);
      expect(readFileSync(join(clone, 'base.txt'), 'utf8')).toBe(`dirty ${String(stage)}\n`);
      expect(existsSync(join(clone, 'src/fixed.ts'))).toBe(false);
      const p = pushMerged(deps(), m, START.getTime(), GREEN);
      expect(p.pushed).toBe(false);
      expect(p.blockers.join(' ')).toMatch(/not in local main/);
    }
    expect(merges()).toHaveLength(0);
    expect(pushes()).toHaveLength(0);
    // the merge worktree still has the source branch checked out, so git refuses to delete it: kept
    expect(keepMerged(deps(), m, t, DATE, ['nightly-fix/test-merge-1'])).toMatchObject({ branch: `nightly-fix-merged/${DATE}`, deleted: [] });
    git(clone, 'worktree', 'remove', '--force', join(root, 'mergewt'));
    const k2 = keepMerged(deps(), m, t, DATE, ['nightly-fix/test-merge-1']);
    expect(k2.branch).toBe(`nightly-fix-merged/${DATE}-2`);
    expect(k2.deleted).toEqual(['nightly-fix/test-merge-1']);
    expect(git(clone, 'rev-parse', `refs/heads/nightly-fix-merged/${DATE}-2`)).toBe(m);
    expect(git(clone, 'branch', '--list', 'nightly-fix/test-merge-1')).toBe('');
  });

  it('4. untracked file elsewhere integrates; an untracked or ignored file at a path M adds is refused with the file intact', () => {
    const { t, m } = build();
    writeFileSync(join(clone, 'scratch-note.txt'), 'keep\n');
    // untracked at the added path
    mkdirSync(join(clone, 'src'), { recursive: true });
    writeFileSync(join(clone, 'src/fixed.ts'), 'mine\n');
    let r = integrateMain(deps(), m, t, DATE, START.getTime());
    refuses(r, /git merge failed/);
    expect(mainSha()).toBe(t);
    expect(readFileSync(join(clone, 'src/fixed.ts'), 'utf8')).toBe('mine\n');
    // ignored at the added path
    writeFileSync(join(clone, '.git', 'info', 'exclude'), 'fixed.txt\n');
    r = integrateMain(deps(), m, t, DATE, START.getTime());
    refuses(r, /git merge failed/);
    expect(mainSha()).toBe(t);
    expect(readFileSync(join(clone, 'src/fixed.ts'), 'utf8')).toBe('mine\n');
    // the unrelated untracked file alone does not block
    rmSync(join(clone, 'src/fixed.ts'));
    r = integrateMain(deps(), m, t, DATE, START.getTime());
    expect(r.how).toBe('ff');
    expect(mainSha()).toBe(m);
    expect(readFileSync(join(clone, 'scratch-note.txt'), 'utf8')).toBe('keep\n');
  });

  it('5. other branch, detached HEAD, or main checked out in another worktree: refused, nothing moves', () => {
    const { t, m } = build();
    git(clone, 'checkout', '-q', '-b', 'other');
    refuses(integrateMain(deps(), m, t, DATE, START.getTime()), /not checked out exactly once|not on main/);
    git(clone, 'checkout', '-q', '--detach');
    refuses(integrateMain(deps(), m, t, DATE, START.getTime()), /not checked out exactly once|not on main/);
    git(clone, 'worktree', 'add', '-q', join(root, 'mainwt'), 'main');
    refuses(integrateMain(deps(), m, t, DATE, START.getTime()), /not checked out exactly once|not on main/);
    expect(mainSha()).toBe(t);
    expect(merges()).toHaveLength(0);
  });

  it('6. conflict predicted by merge-tree: refused, no git merge run, no MERGE_HEAD', () => {
    const { m } = build('src/shared.ts', 'fix side\n');
    commit(clone, 'src/shared.ts', 'main side\n');
    const before = mainSha();
    const r = integrateMain(deps(), m, git(clone, 'rev-parse', 'HEAD~1'), DATE, START.getTime());
    refuses(r, /would conflict.*conflicting paths: src\/shared\.ts/);
    expect(merges()).toHaveLength(0);
    expect(existsSync(join(clone, '.git', 'MERGE_HEAD'))).toBe(false);
    expect(mainSha()).toBe(before);
    expect(readFileSync(join(clone, 'src/shared.ts'), 'utf8')).toBe('main side\n');
  });

  it('7a. pre-existing MERGE_HEAD: refused', () => {
    const { t, m } = build();
    writeFileSync(join(clone, '.git', 'MERGE_HEAD'), `${m}\n`);
    refuses(integrateMain(deps(), m, t, DATE, START.getTime()), /operation in progress: MERGE_HEAD/);
    expect(mainSha()).toBe(t);
    expect(merges()).toHaveLength(0);
  });

  it('7b. signing failure on the --no-ff merge: aborted, no MERGE_HEAD, main unchanged, tree clean', () => {
    const { m } = build();
    const u = commit(clone, 'local-only.txt');
    git(clone, 'config', 'commit.gpgsign', 'true');
    git(clone, 'config', 'gpg.program', 'false');
    const r = integrateMain(deps(), m, git(clone, 'rev-parse', 'HEAD~1'), DATE, START.getTime());
    refuses(r, /git merge failed/);
    expect(r.refusals.join(' ')).not.toMatch(/main moved|tracked changes remain/);
    expect(existsSync(join(clone, '.git', 'MERGE_HEAD'))).toBe(false);
    expect(mainSha()).toBe(u);
    expect(git(clone, 'status', '--porcelain=v1', '--untracked-files=no')).toBe('');
    expect(existsSync(join(clone, 'src/fixed.ts'))).toBe(false);
  });

  it('8. origin moved to T: M is pushed; origin moved to X (not in M): integrated, not pushed, "never forced"', () => {
    const { t, m } = build();
    git(clone, 'push', '-q', 'origin', `${t}:main`);
    expect(integrateMain(deps(), m, t, DATE, START.getTime()).how).toBe('ff');
    expect(pushMerged(deps(), m, START.getTime(), GREEN).pushed).toBe(true);
    expect(originMain()).toBe(m);

    // second scenario: a fresh origin diverged by another clone
    git(origin, 'update-ref', 'refs/heads/main', t); // test setup on the bare repo, not code under test
    const other = join(root, 'other');
    git(root, 'clone', '-q', origin, other);
    git(other, 'checkout', '-q', 'main');
    const x = commit(other, 'elsewhere.txt');
    git(other, 'push', '-q', 'origin', 'main');
    calls = [];
    const p = pushMerged(deps(), m, START.getTime(), GREEN);
    expect(p.pushed).toBe(false);
    expect(p.blockers.join(' ')).toMatch(/diverged.*never forced/);
    expect(originMain()).toBe(x);
    expect(pushes()).toHaveLength(0);
    expect(calls.some((c) => c.cmd === 'gh')).toBe(false);
  });

  it('9. M already on origin: no push; a descendant pushed by another clone just before our push: rejected, reported as already on origin', () => {
    const { m } = build();
    expect(integrateMain(deps(), m, git(clone, 'rev-parse', 'HEAD'), DATE, START.getTime()).how).toBe('ff');
    git(clone, 'push', '-q', 'origin', `${m}:main`);
    const p1 = pushMerged(deps(), m, START.getTime(), GREEN);
    expect(p1).toMatchObject({ pushed: false, alreadyOnOrigin: true, blockers: [] });
    expect(pushes()).toHaveLength(0);

    git(origin, 'update-ref', 'refs/heads/main', git(clone, 'rev-parse', `${m}^1`)); // rewind origin to T (setup)
    const other = join(root, 'other');
    git(root, 'clone', '-q', origin, other);
    interceptPush = () => {
      interceptPush = undefined;
      git(other, 'fetch', '-q', 'origin', m);
      git(other, 'checkout', '-q', '--detach', m);
      const d = commit(other, 'descendant.txt');
      git(other, 'push', '-q', 'origin', `${d}:main`);
    };
    calls = [];
    const p2 = pushMerged(deps(), m, START.getTime(), GREEN);
    expect(pushes()).toHaveLength(1);
    expect(p2).toMatchObject({ pushed: false, alreadyOnOrigin: true, blockers: [], dispatched: false });
    expect(() => git(origin, 'merge-base', '--is-ancestor', m, 'refs/heads/main')).not.toThrow();
    expect(originMain()).not.toBe(m);
  });

  it('10. collateralOk false: integrated, not pushed; deadline passed or CI=1: nothing written or pushed', () => {
    const { t, m } = build();
    now = LATE;
    refuses(integrateMain(deps(), m, t, DATE, START.getTime()), /hard stop|not enough time/);
    expect(mainSha()).toBe(t);
    expect(pushMerged(deps(), m, START.getTime(), GREEN).blockers.join(' ')).toMatch(/hard stop/);
    now = START;
    expect(integrateMain(deps(), m, t, DATE, START.getTime()).how).toBe('ff');
    const p = pushMerged(deps(), m, START.getTime(), { ...GREEN, collateralOk: false });
    expect(p.pushed).toBe(false);
    expect(p.blockers.join(' ')).toMatch(/full run/);
    envExtra = { CI: '1' };
    expect(pushMerged(deps(), m, START.getTime(), GREEN).blockers.join(' ')).toMatch(/CI, TTE_E2E_LOCAL/);
    expect(pushes()).toHaveLength(0);
    expect(calls.some((c) => c.cmd === 'gh')).toBe(false);
    expect(originMain()).not.toBe(m);
  });

  it('12. CI set: integrate refuses before writing; a T that is not an ancestor of M is refused', () => {
    const { t, m } = build();
    envExtra = { CI: '1' };
    refuses(integrateMain(deps(), m, t, DATE, START.getTime()), /CI, TTE_E2E_LOCAL/);
    expect(calls).toHaveLength(0);
    envExtra = {};
    refuses(integrateMain(deps(), m, m.slice(0, 12), DATE, START.getTime()), /not full hex/);
    const stray = git(clone, 'commit-tree', `${t}^{tree}`, '-m', 'stray'); // a commit that is not an ancestor of M
    refuses(integrateMain(deps(), m, stray, DATE, START.getTime()), /not an ancestor of the merge commit/);
    expect(keepMerged(deps(), m, stray, DATE, ['nightly-fix/test']).error).toMatch(/not an ancestor/);
    expect(git(clone, 'branch', '--list', 'nightly-fix-merged/*')).toBe('');
    expect(mainSha()).toBe(t);
    expect(merges()).toHaveLength(0);
  });

  it('13. keepMerged deletes contained nightly-fix/* sources and keeps an F ahead of M, main and non-nightly names', () => {
    const { t, f, m } = build();
    git(clone, 'worktree', 'remove', '--force', join(root, 'mergewt'));
    git(clone, 'worktree', 'remove', '--force', join(root, 'fix'));
    git(clone, 'branch', 'nightly-fix/ahead', f);
    git(clone, 'checkout', '-q', 'nightly-fix/ahead');
    commit(clone, 'src/more.ts');
    git(clone, 'checkout', '-q', 'main');
    git(clone, 'branch', 'feature', f);
    const k = keepMerged(deps(), m, t, DATE, ['nightly-fix/test', 'nightly-fix/test-merge-1', 'nightly-fix/ahead', 'main', 'feature']);
    expect(k.branch).toBe(`nightly-fix-merged/${DATE}`);
    expect(k.deleted).toEqual(['nightly-fix/test', 'nightly-fix/test-merge-1']);
    expect(k.kept).toEqual(['nightly-fix/ahead', 'main', 'feature']);
    expect(git(clone, 'branch', '--list', 'nightly-fix/ahead')).not.toBe('');
    expect(git(clone, 'rev-parse', `refs/heads/nightly-fix-merged/${DATE}`)).toBe(m);
    expect(keepMerged(deps(), m, 'x', DATE, ['nightly-fix/ahead']).error).toMatch(/not full hex/);
  });

  it('11. pushArgsFor throws on an empty or symbolic ref; no host, IP or URL and no temp root in the output', () => {
    expect(() => pushArgsFor('')).toThrow();
    expect(() => pushArgsFor('main')).toThrow();
    const { t, m } = build();
    const r = integrateMain(deps(), m, t, DATE, START.getTime());
    const p = pushMerged(deps(), m, START.getTime(), GREEN);
    const text = `${out}\n${JSON.stringify(r)}\n${JSON.stringify(p)}`;
    expect(p.pushed).toBe(true);
    expect(text).not.toMatch(/https?:\/\/|ssh:\/\/|git@|\b\d{1,3}(\.\d{1,3}){3}\b|\.git\b|origin\.git/);
    expect(text).not.toContain(root);
  });
});
