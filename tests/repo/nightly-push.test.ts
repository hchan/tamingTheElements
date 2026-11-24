import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { main, type FixDeps } from '../../tools/ci/nightly-fix';
import { cleanPushBlockers, describePush, nightVerdict, type CleanPushInput, type PushStatus } from '../../tools/ci/nightly-push';
import { finishStatus, pendingStatus } from '../../tools/ci/nightly-status';

const SHA = 'c'.repeat(40);
const OTHER = 'e'.repeat(40);

describe('clean-night push decision (pure)', () => {
  const ok: CleanPushInput = { verdict: 'green', noEnvOverride: true, onMain: true, treeClean: true, originIsAncestor: true, testedIsAncestor: true, hasCommits: true, gateCommitOk: true };
  const red = (unrecorded: number) =>
    finishStatus(pendingStatus(SHA, 'raw-1', 's'), 1, { passed: 1, failed: [{ file: 'a.spec.ts', title: 'x' }], flaky: [] }, unrecorded ? [] : [{ file: 'tests/e2e/a.spec.ts', titleIncludes: 'x' }], 'f', 'PC');

  it('verdict: pass is green, red with only known reds is known-red, an unrecorded red is new-red, the rest not-run', () => {
    expect(nightVerdict(finishStatus(pendingStatus(SHA, 'raw-1', 's'), 0, { passed: 3, failed: [], flaky: [] }, [], 'f', 'PC'))).toBe('green');
    expect(nightVerdict(red(0))).toBe('known-red');
    expect(nightVerdict(red(1))).toBe('new-red');
    expect(nightVerdict(pendingStatus(SHA, 'raw-1', 's'))).toBe('not-run');
    expect(nightVerdict(finishStatus(pendingStatus(SHA, 'raw-1', 's'), 95, undefined, [], 'f', ''))).toBe('not-run');
    expect(nightVerdict(undefined)).toBe('not-run');
  });
  it('green pushes', () => {
    expect(cleanPushBlockers(ok)).toEqual([]);
  });
  it('known-red only pushes', () => {
    expect(cleanPushBlockers({ ...ok, verdict: 'known-red' })).toEqual([]);
  });
  it('a new red blocks', () => {
    expect(cleanPushBlockers({ ...ok, verdict: 'new-red' }).join(' ')).toMatch(/new \(unrecorded\) reds/);
    expect(cleanPushBlockers({ ...ok, verdict: 'not-run' })).toHaveLength(1);
  });
  it('diverged (origin/main not an ancestor) blocks, never forced', () => {
    expect(cleanPushBlockers({ ...ok, originIsAncestor: false }).join(' ')).toMatch(/diverged.*never forced/);
  });
  it('a dirty tree blocks', () => {
    expect(cleanPushBlockers({ ...ok, treeClean: false }).join(' ')).toMatch(/not clean/);
  });
  it('gate:commit fail, not on main, a tested sha that is not an ancestor, nothing to push and a Mac-lane env override each block', () => {
    for (const k of ['gateCommitOk', 'onMain', 'testedIsAncestor', 'hasCommits', 'noEnvOverride'] as const) expect(cleanPushBlockers({ ...ok, [k]: false })).toHaveLength(1);
  });
  it('describes the result', () => {
    const s: PushStatus = { schema: 1, verdict: 'green', sha: SHA, pushed: false, blockers: ['b'], finishedAt: 't' };
    expect(describePush(s)).toEqual([`nightly clean push (t): green run at ${SHA.slice(0, 7)}: not pushed`, '  - b']);
    expect(describePush({ ...s, pushed: true })[0]).toContain('pushed main to origin/main');
    expect(describePush(undefined)).toEqual([]);
  });
});

interface Night {
  /** Failed titles in the collected full run (empty = green). */
  reds?: string[];
  /** Titles recorded in tools/ci/known-red.json. */
  known?: string[];
  diverged?: boolean;
  dirty?: boolean;
  gate?: number;
  head?: string;
  /** HEAD is 3 commits past the tested sha (tested is an ancestor of HEAD). */
  moved?: boolean;
  branch?: string;
  ahead?: string;
  env?: Record<string, string>;
}

describe('collect-and-fix pushes main on a night with no new reds (fake runner)', () => {
  let dir: string;
  let calls: string[];
  let out: string;
  beforeEach(() => {
    mkdirSync(resolve('.scratch'), { recursive: true });
    dir = mkdtempSync(join(resolve('.scratch'), 'nightly-push-test-'));
    calls = [];
    out = '';
    mkdirSync(join(dir, 'gate'), { recursive: true });
    writeFileSync(join(dir, 'gate', 'nightly-status.json'), JSON.stringify(pendingStatus(SHA, 'raw-1', new Date(2026, 10, 19, 23, 0, 0).toISOString())));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const deps = (n: Night): FixDeps => {
    if (n.known?.length) {
      mkdirSync(join(dir, 'tools', 'ci'), { recursive: true });
      writeFileSync(join(dir, 'tools', 'ci', 'known-red.json'), JSON.stringify({ entries: n.known.map((t) => ({ file: 'tests/e2e/menu.spec.ts', titleIncludes: t })) }));
    }
    const reds = n.reds ?? [];
    return {
      env: n.env ?? {},
      repo: dir,
      statusDir: join(dir, 'gate'),
      now: () => new Date(2026, 10, 20, 2, 0, 0),
      sleep: () => undefined,
      out: (s) => {
        out += s;
      },
      err: (s) => {
        out += s;
      },
      run: (cmd, args, _cwd, env) => {
        const line = `${cmd} ${args.join(' ')}`;
        calls.push(line);
        const ok = (stdout = '', code = 0) => ({ code, stdout, stderr: '' });
        if (line.includes('--pc-attach raw-1')) {
          const specs = ['ok', ...reds].map((t) => ({ title: t, tests: [{ status: reds.includes(t) ? 'unexpected' : 'expected' }] }));
          writeFileSync(env['PLAYWRIGHT_JSON_OUTPUT_FILE'] ?? '', JSON.stringify({ suites: [{ file: 'menu.spec.ts', specs }] }));
          return ok('e2e ran on: PC', reds.length ? 1 : 0);
        }
        if (line === 'git rev-parse HEAD') return ok(`${n.head ?? SHA}\n`);
        if (line === 'git symbolic-ref --short HEAD') return ok(`${n.branch ?? 'main'}\n`);
        if (line === 'git status --porcelain') return ok(n.dirty ? ' M src/a.ts\n' : '');
        if (line === `git merge-base --is-ancestor origin/main ${SHA}`) return ok('', n.diverged ? 1 : 0);
        if (line === `git merge-base --is-ancestor ${SHA} HEAD`) return ok('', n.head === undefined || n.moved ? 0 : 1);
        if (line === `git rev-list --count origin/main..${SHA}`) return ok(`${n.ahead ?? '2'}\n`);
        if (line === `git rev-list --count ${SHA}..HEAD`) return ok(n.moved ? '3\n' : '0\n');
        if (line.startsWith('git worktree')) return ok();
        if (line === 'corepack pnpm gate:commit') {
          expect(env['GIT_CONFIG_VALUE_0']).toBe('disabled:');
          return { code: n.gate ?? 0, stdout: n.gate ? 'x\nFAIL tests/repo/pin.test.ts\n' : '', stderr: '' };
        }
        if (cmd === 'claude') throw new Error('no fix round expected');
        return ok();
      },
    };
  };
  const pushes = (): string[] => calls.filter((c) => /^git push /.test(c));
  const gates = (): string[] => calls.filter((c) => c.includes('gate:commit'));
  const pushStatus = (): PushStatus => JSON.parse(readFileSync(join(dir, 'gate', 'nightly-push-status.json'), 'utf8')) as PushStatus;

  it('green night: gate:commit on main, then exactly one plain push of HEAD to main', () => {
    expect(main(['collect-and-fix'], deps({}))).toBe(0);
    expect(gates()).toHaveLength(1);
    expect(pushes()).toEqual([`git push origin ${SHA}:main`]);
    expect(calls.join('\n')).not.toMatch(/--force|-f\b|\+HEAD/);
    expect(pushStatus()).toMatchObject({ verdict: 'green', pushed: true, blockers: [] });
    expect(out).toContain('pushed main to origin/main');
    expect(calls.filter((c) => c.startsWith('gh '))).toEqual(['gh workflow run ci.yml --ref main']);
  });
  it('a red gate:commit keeps the output tail in the status and the report', () => {
    main(['collect-and-fix'], deps({ gate: 1 }));
    expect(pushStatus().gateTail).toContain('FAIL tests/repo/pin.test.ts');
    expect(out).toContain('| FAIL tests/repo/pin.test.ts');
  });
  it('a blocked night dispatches no Pages build', () => {
    expect(main(['collect-and-fix'], deps({ ahead: '0' }))).toBe(0);
    expect(calls.filter((c) => c.startsWith('gh '))).toEqual([]);
  });
  it('known-red only night also pushes', () => {
    expect(main(['collect-and-fix'], deps({ reds: ['opens'], known: ['opens'] }))).toBe(0);
    expect(pushes()).toEqual([`git push origin ${SHA}:main`]);
    expect(pushStatus()).toMatchObject({ verdict: 'known-red', pushed: true });
  });
  it('main moved after the tested sha (ancestor): gate in a temp worktree, push the tested sha, report the untested count', () => {
    expect(main(['collect-and-fix'], deps({ head: OTHER, moved: true }))).toBe(0);
    expect(calls.filter((c) => c.startsWith('git worktree add --detach'))).toHaveLength(1);
    expect(calls.filter((c) => c.startsWith('git worktree remove'))).toHaveLength(1);
    expect(gates()).toHaveLength(1);
    expect(pushes()).toEqual([`git push origin ${SHA}:main`]);
    expect(pushes().join(' ')).not.toMatch(/--force| -f\b|\+|HEAD:main/);
    expect(pushStatus()).toMatchObject({ pushed: true, untestedLocal: 3 });
  });
  it('main moved and the gate fails: temp worktree removed, no push', () => {
    expect(main(['collect-and-fix'], deps({ head: OTHER, moved: true, gate: 1 }))).toBe(0);
    expect(calls.filter((c) => c.startsWith('git worktree remove'))).toHaveLength(1);
    expect(pushes()).toEqual([]);
  });
  it('a new red goes to the fix loop, no plain push and no gate:commit', () => {
    expect(main(['collect-and-fix'], deps({ reds: ['a', 'b', 'c', 'd'] }))).toBe(0);
    expect(pushes()).toEqual([]);
    expect(gates()).toEqual([]);
    expect(readFileSync(join(dir, 'gate', 'nightly-fix-status.json'), 'utf8')).toContain('needs-human');
  });
  it('diverged origin/main: no gate, no push', () => {
    expect(main(['collect-and-fix'], deps({ diverged: true }))).toBe(0);
    expect(gates()).toEqual([]);
    expect(pushes()).toEqual([]);
    expect(pushStatus().blockers.join(' ')).toMatch(/diverged/);
  });
  it('dirty tree on main: no gate, no push', () => {
    expect(main(['collect-and-fix'], deps({ dirty: true }))).toBe(0);
    expect(gates()).toEqual([]);
    expect(pushes()).toEqual([]);
    expect(pushStatus().blockers.join(' ')).toMatch(/not clean/);
  });
  it('gate:commit red, untested commits on main, not on main or nothing ahead: no push', () => {
    for (const n of [{ gate: 1 }, { head: OTHER }, { branch: 'feature' }, { ahead: '0' }, { env: { CI: '1' } }] as Night[]) {
      calls = [];
      writeFileSync(join(dir, 'gate', 'nightly-status.json'), JSON.stringify(pendingStatus(SHA, 'raw-1', new Date(2026, 10, 19, 23, 0, 0).toISOString())));
      expect(main(['collect-and-fix'], deps(n))).toBe(0);
      expect(pushes()).toEqual([]);
      expect(pushStatus().pushed).toBe(false);
    }
  });
  it('the 09:00 report includes the push result', () => {
    main(['collect-and-fix'], deps({}));
    expect(main(['report'], deps({}))).toBe(0);
    expect(readFileSync(join(dir, 'gate', 'nightly-morning-report.md'), 'utf8')).toContain('nightly clean push');
  });
});
