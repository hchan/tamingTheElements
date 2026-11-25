/**
 * Rehearsal of the nightly clean push (tools/ci/nightly-push.ts pushCleanNight) against REAL git: a bare repo stands in for origin,
 * a clone for the main checkout and `<clone>/.scratch/nightly-wt` for the nightly worktree. Only the gate run, the gh dispatch and
 * the clock are fake (gh is recorded, never run). No network, no real remote. The fake-runner suites are nightly-push.test.ts and
 * nightly-fix.test.ts.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DISPATCH_PAGES_ARGS, NIGHTLY_WT_REL, pushArgsFor, pushCleanNight, readPushStatus, type PushDeps } from '../../tools/ci/nightly-push';
import { finishStatus, pendingStatus } from '../../tools/ci/nightly-status';

const IDENT = ['-c', 'user.name=Rehearsal', '-c', 'user.email=rehearsal@example.invalid', '-c', 'commit.gpgsign=false'];
const START = new Date(2026, 10, 25, 1, 0, 0);

interface Call {
  cmd: string;
  args: readonly string[];
  cwd: string;
}

describe('pushCleanNight with real git (bare origin, clone, detached nightly worktree)', () => {
  let root: string;
  let origin: string;
  let clone: string;
  let statusDir: string;
  let calls: Call[];
  let out: string;
  let gateExit: number;
  const env = (): Record<string, string> => ({ PATH: process.env.PATH ?? '', HOME: root, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0' });
  const git = (cwd: string, ...a: string[]): string => execFileSync('git', [...IDENT, ...a], { cwd, env: env(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const commit = (cwd: string, file: string): string => {
    writeFileSync(join(cwd, file), `${file}\n`);
    git(cwd, 'add', file);
    git(cwd, 'commit', '-q', '-m', file);
    return git(cwd, 'rev-parse', 'HEAD');
  };
  const originMain = (): string => git(origin, 'rev-parse', 'refs/heads/main');

  const deps = (): PushDeps => ({
    env: env(),
    repo: clone,
    statusDir,
    now: () => START,
    out: (s) => {
      out += s;
    },
    run: (cmd, args, cwd, e) => {
      calls.push({ cmd, args, cwd });
      if (cmd === 'gh') return { code: 0, stdout: '', stderr: '' }; // recorded, never run
      if (cmd === 'corepack') {
        // fake gate (and install): fails when the worktree is dirty or the test says so
        const dirty = git(cwd, 'status', '--porcelain') !== '';
        return { code: args.includes('gate:commit') && (dirty || gateExit !== 0) ? 1 : 0, stdout: '', stderr: '' };
      }
      try {
        return { code: 0, stdout: execFileSync(cmd, args, { cwd, env: e, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }), stderr: '' };
      } catch (err) {
        const x = err as { status?: number; stdout?: string; stderr?: string };
        return { code: x.status ?? 1, stdout: x.stdout ?? '', stderr: x.stderr ?? '' };
      }
    },
  });
  const night = (sha: string) => finishStatus(pendingStatus(sha, 'raw-1', START.toISOString()), 0, { passed: 3, failed: [], flaky: [] }, [], START.toISOString(), 'PC');
  const pushes = (): Call[] => calls.filter((c) => c.cmd === 'git' && c.args[0] === 'push');

  beforeEach(() => {
    mkdirSync(resolve('.scratch'), { recursive: true });
    root = mkdtempSync(join(resolve('.scratch'), 'push-rehearsal-')); // worktree .scratch, not the system temp
    origin = join(root, 'origin.git');
    clone = join(root, 'clone');
    statusDir = join(root, 'status');
    calls = [];
    out = '';
    gateExit = 0;
    git(root, 'init', '-q', '--bare', '-b', 'main', origin);
    git(root, 'clone', '-q', origin, clone);
    git(clone, 'checkout', '-q', '-B', 'main');
    commit(clone, 'base.txt');
    git(clone, 'push', '-q', 'origin', 'main');
    git(clone, 'worktree', 'add', '-q', '--detach', join(clone, NIGHTLY_WT_REL), 'HEAD'); // stands in for .scratch/nightly-wt
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('1. clean fast-forward: origin main becomes the tested sha, using exactly pushArgsFor(T) from the repo cwd, then dispatches Pages', () => {
    const t = commit(clone, 'tested.txt');
    expect(originMain()).not.toBe(t);
    pushCleanNight(deps(), night(t), START.getTime());
    expect(originMain()).toBe(t);
    const st = readPushStatus(statusDir);
    expect(st?.pushed).toBe(true);
    expect(st?.blockers).toEqual([]);
    expect(pushes()).toHaveLength(1);
    expect(pushes()[0]?.args).toEqual(pushArgsFor(t));
    expect(pushes()[0]?.args.join(' ')).not.toMatch(/--force|-f\b|--force-with-lease|\+/);
    expect(pushes()[0]?.cwd).toBe(clone);
    // the gate ran in the detached worktree (moved to the tested sha), never in the main checkout
    const wt = join(clone, NIGHTLY_WT_REL);
    expect(calls.filter((c) => c.args.includes('gate:commit')).map((c) => c.cwd)).toEqual([wt]);
    expect(git(wt, 'rev-parse', 'HEAD')).toBe(t);
    const gh = calls.filter((c) => c.cmd === 'gh');
    expect(gh.map((c) => c.args)).toEqual([DISPATCH_PAGES_ARGS]);
  });

  it('pushes only the tested commit; a later untested commit on main stays local', () => {
    const t = commit(clone, 'tested.txt');
    const later = commit(clone, 'later.txt');
    pushCleanNight(deps(), night(t), START.getTime());
    expect(originMain()).toBe(t);
    expect(originMain()).not.toBe(later);
    expect(readPushStatus(statusDir)?.untestedLocal).toBe(1);
  });

  it('2. origin diverged (has a commit not in T): refused, origin unchanged, no push or dispatch run', () => {
    const t = commit(clone, 'tested.txt');
    const other = join(root, 'other');
    git(root, 'clone', '-q', origin, other);
    git(other, 'checkout', '-q', 'main');
    commit(other, 'elsewhere.txt');
    git(other, 'push', '-q', 'origin', 'main');
    const before = originMain();
    pushCleanNight(deps(), night(t), START.getTime());
    expect(originMain()).toBe(before);
    const st = readPushStatus(statusDir);
    expect(st?.pushed).toBe(false);
    expect(st?.blockers.join(' ')).toMatch(/diverged.*never forced/);
    expect(pushes()).toHaveLength(0);
    expect(calls.some((c) => c.cmd === 'gh')).toBe(false);
  });

  it('3a. no new commits (tested sha is already origin/main): refused', () => {
    const t = git(clone, 'rev-parse', 'HEAD');
    pushCleanNight(deps(), night(t), START.getTime());
    expect(originMain()).toBe(t);
    const st = readPushStatus(statusDir);
    expect(st?.pushed).toBe(false);
    expect(st?.blockers.join(' ')).toMatch(/nothing to push/);
    expect(pushes()).toHaveLength(0);
  });

  it('3b. dirty nightly worktree (gate:commit red on the tree): refused, origin unchanged', () => {
    const t = commit(clone, 'tested.txt');
    git(clone, 'worktree', 'remove', '--force', join(clone, NIGHTLY_WT_REL));
    git(clone, 'worktree', 'add', '-q', '--detach', join(clone, NIGHTLY_WT_REL), t);
    writeFileSync(join(clone, NIGHTLY_WT_REL, 'tested.txt'), 'dirty\n');
    const before = originMain();
    pushCleanNight(deps(), night(t), START.getTime());
    expect(originMain()).toBe(before);
    const st = readPushStatus(statusDir);
    expect(st?.pushed).toBe(false);
    expect(st?.blockers.join(' ')).toMatch(/gate:commit failed/);
    expect(pushes()).toHaveLength(0);
  });

  it('3c. a failing gate:commit refuses; a dirty main checkout is never read (sha-based) and does not block', () => {
    const t = commit(clone, 'tested.txt');
    gateExit = 1;
    pushCleanNight(deps(), night(t), START.getTime());
    expect(originMain()).not.toBe(t);
    expect(readPushStatus(statusDir)?.pushed).toBe(false);
    gateExit = 0;
    writeFileSync(join(clone, 'base.txt'), 'dirty main checkout\n');
    pushCleanNight(deps(), night(t), START.getTime());
    expect(originMain()).toBe(t);
    expect(readPushStatus(statusDir)?.pushed).toBe(true);
  });

  it('4. the status text and output never contain a host, IP or URL', () => {
    const t = commit(clone, 'tested.txt');
    pushCleanNight(deps(), night(t), START.getTime());
    const text = `${out}\n${readFileSync(join(statusDir, 'nightly-push-status.json'), 'utf8')}`;
    expect(existsSync(join(statusDir, 'nightly-push-status.json'))).toBe(true);
    expect(text).not.toMatch(/https?:\/\/|ssh:\/\/|git@|\b\d{1,3}(\.\d{1,3}){3}\b|\.git\b|origin\.git/);
    expect(text).not.toContain(root);
  });
});
