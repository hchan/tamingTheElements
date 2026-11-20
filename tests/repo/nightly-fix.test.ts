import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fix, main, type FixDeps } from '../../tools/ci/nightly-fix';
import {
  ALLOWED_TOOLS, buildPrompt, claudeArgs, DENIED_TOOLS, extractFailures, finalState, forbiddenTouched, isForbiddenPath, MAX_ROUNDS, parsePorcelainZ, parseTriage,
  pushBlockers, roundAllowed, shouldRun, specPath, stopsLoop, triage, type PushInput,
} from '../../tools/ci/nightly-fix-logic';
import { finishStatus, pendingStatus } from '../../tools/ci/nightly-status';

describe('forbidden paths', () => {
  it.each([
    'src/core/sim/step.ts', 'src/core/version.ts', 'tests/fixtures/golden/a.json', 'tests/fixtures/balance/x.json', 'tools/ci/size-budget.json', 'docs/REPO-MAP.md',
    'src/game/assets/manifest.generated.json', 'package.json', 'pnpm-lock.yaml', 'CLAUDE.md', '.claude/settings.json', '.github/workflows/nightly.yml',
    'tools/ci/nightly-fix.ts', 'tools/ci/known-red.json', 'war/WEB-INF/user.properties', '.env.local', 'keys/id_ed25519', 'x/server.pem', 'config/credentials.json',
    '../outside.ts', '/etc/passwd', './src//core/x.ts',
  ])('blocks %s', (p) => {
    expect(isForbiddenPath(p)).toBe(true);
  });
  it.each(['tests/e2e/menu.spec.ts', 'src/game/scenes/menu.ts', 'tests/e2e/helpers/wait.ts', 'src/corex/a.ts', 'docs/TESTING.md'])('allows %s', (p) => {
    expect(isForbiddenPath(p)).toBe(false);
  });
  it('lists only the offenders and reads porcelain -z (renames, untracked)', () => {
    const out = ' M tests/e2e/a.spec.ts\0?? src/core/new.ts\0R  b.ts\0src/core/old.ts\0';
    expect(parsePorcelainZ(out)).toEqual(['tests/e2e/a.spec.ts', 'src/core/new.ts', 'b.ts', 'src/core/old.ts']);
    expect(forbiddenTouched(parsePorcelainZ(out))).toEqual(['src/core/new.ts', 'src/core/old.ts']);
  });
});

describe('rounds and stops', () => {
  it('allows at most 3 rounds', () => {
    expect(MAX_ROUNDS).toBe(3);
    expect([0, 1, 2, 3, 4].map(roundAllowed)).toEqual([true, true, true, false, false]);
  });
  it('stops the loop on router exits 89/94/95/96 and unknown codes, not on green/red', () => {
    for (const c of [89, 94, 95, 96, 93, 97, 130, 124]) expect(stopsLoop(c)).toBe(true);
    expect(stopsLoop(0)).toBe(false);
    expect(stopsLoop(1)).toBe(false);
  });
  it('triage: fixed, flaky, retry, unfixed, forbidden and agent needs-human', () => {
    const base = { round: 1, forbidden: [], agent: 'none', diffEmpty: false, rerunExit: 0 } as const;
    expect(triage(base).outcome).toBe('fixed');
    expect(triage({ ...base, diffEmpty: true }).outcome).toBe('flaky');
    expect(triage({ ...base, rerunExit: 1 }).outcome).toBe('retry');
    expect(triage({ ...base, rerunExit: 1, round: 3 }).outcome).toBe('unfixed');
    expect(triage({ ...base, forbidden: ['src/core/a.ts'] }).outcome).toBe('needs-human');
    expect(triage({ ...base, agent: 'needs-human' }).outcome).toBe('needs-human');
  });
});

describe('push preconditions', () => {
  const good: PushInput = { hasCommits: true, shaOnOrigin: true, mergeOk: true, forbidden: [], markersClean: true, gatePushOk: true, rerunGreen: true, originUnmoved: true, noEnvOverride: true };
  it('pushes only when everything holds', () => {
    expect(pushBlockers(good)).toEqual([]);
  });
  it.each([
    ['hasCommits', false], ['shaOnOrigin', false], ['mergeOk', false], ['markersClean', false], ['gatePushOk', false], ['rerunGreen', false], ['originUnmoved', false], ['noEnvOverride', false],
  ] as const)('blocks when %s fails', (k, v) => {
    expect(pushBlockers({ ...good, [k]: v })).toHaveLength(1);
  });
  it('blocks on forbidden paths in the merged diff', () => {
    expect(pushBlockers({ ...good, forbidden: ['src/core/a.ts'] })).toHaveLength(1);
  });
  it('final state', () => {
    const r = (outcome: 'fixed' | 'flaky' | 'needs-human' | 'unfixed') => ({ file: 'a', title: 'b', outcome, rounds: 1, reason: '' });
    expect(finalState([r('fixed'), r('flaky')], true)).toBe('fixed-pushed');
    expect(finalState([r('fixed')], false)).toBe('red-unfixed');
    expect(finalState([r('fixed'), r('needs-human')], true)).toBe('needs-human');
    expect(finalState([r('unfixed')], true)).toBe('red-unfixed');
  });
});

describe('prompt, triage line and claude args', () => {
  const f = { file: 'menu.spec.ts', title: 'opens', message: 'Timeout 5000ms', tracePath: '/t/trace.zip' };
  it('prompt has spec, title, error, trace and the hard stops', () => {
    const p = buildPrompt(f, 2, 'still red');
    for (const s of ['tests/e2e/menu.spec.ts', 'opens', 'Timeout 5000ms', '/t/trace.zip', 'src/core', 'tests/fixtures', 'SIM_VERSION', 'Round 2 of 3', 'still red']) expect(p).toContain(s);
  });
  it('parses the TRIAGE line, else none', () => {
    expect(parseTriage('x\nTRIAGE: {"verdict":"flaky","reason":"r"}\n')).toEqual({ verdict: 'flaky', reason: 'r' });
    expect(parseTriage('TRIAGE: {"verdict":"bogus"}').verdict).toBe('none');
    expect(parseTriage('nothing').verdict).toBe('none');
  });
  it('allowlist has no push or commit, denylist does', () => {
    expect(ALLOWED_TOOLS.join(' ')).not.toMatch(/push|commit|Bash\(\*|curl/);
    expect(DENIED_TOOLS).toContain('Bash(git push:*)');
    expect(claudeArgs('p').slice(0, 2)).toEqual(['-p', 'p']);
  });
  it('specPath adds tests/e2e once', () => {
    expect(specPath('a.spec.ts')).toBe('tests/e2e/a.spec.ts');
    expect(specPath('tests/e2e/a.spec.ts')).toBe('tests/e2e/a.spec.ts');
  });
  it('extracts error and trace of the last failed result', () => {
    const json = { suites: [{ file: 'a.spec.ts', specs: [{ title: 't', tests: [{ results: [{ status: 'failed', errors: [{ message: '\u001b[31mboom\u001b[0m' }], attachments: [{ name: 'trace', path: '/p/t.zip' }] }] }] }] }] };
    expect(extractFailures(json, [{ file: 'a.spec.ts', title: 't' }])).toEqual([{ file: 'a.spec.ts', title: 't', message: 'boom', tracePath: '/p/t.zip' }]);
    expect(extractFailures(json, [{ file: 'a.spec.ts', title: 'gone' }])[0]?.message).toMatch(/no error text/);
  });
});

describe('nightly-fix command (fake runner)', () => {
  let dir: string;
  let out: string;
  let calls: string[];
  const SHA = 'c'.repeat(40);
  const deps = (env: Record<string, string> = {}, code: (a: readonly string[]) => number = () => 0): FixDeps => ({
    env,
    repo: join(dir, 'repo'),
    statusDir: join(dir, 'gate'),
    now: () => new Date('2026-11-20T06:30:00Z'),
    run: (cmd, args) => {
      calls.push([cmd, ...args].join(' '));
      return { code: code(args), stdout: '', stderr: '' };
    },
    out: (s) => {
      out += s;
    },
    err: (s) => {
      out += s;
    },
  });
  const writeRed = (): void => {
    const red = finishStatus(pendingStatus(SHA, 'raw-1', 's'), 1, { passed: 1, failed: [{ file: 'menu.spec.ts', title: 'opens' }], flaky: [] }, [], 'f', 'PC');
    mkdirSync(join(dir, 'gate'), { recursive: true });
    writeFileSync(join(dir, 'gate', 'nightly-status.json'), JSON.stringify(red));
  };
  beforeEach(() => {
    mkdirSync(resolve('.scratch'), { recursive: true });
    dir = mkdtempSync(join(resolve('.scratch'), 'nightly-fix-test-'));
    out = '';
    calls = [];
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('does nothing without a red status with unrecorded failures', () => {
    expect(fix(deps(), false)).toBe(0);
    expect(out).toContain('nothing to do');
    expect(calls).toEqual([]);
    expect(shouldRun(undefined)).toBe(false);
  });
  it('dry run prints prompt and commands, launches nothing', () => {
    writeRed();
    expect(main(['--dry-run'], deps())).toBe(0);
    expect(out).toContain('dry run');
    expect(out).toContain('tests/e2e/menu.spec.ts');
    expect(out).toContain('--pc');
    expect(out).toContain('(no force)');
    expect(calls).toEqual([]);
  });
  it('refuses with a Mac override in the environment', () => {
    writeRed();
    expect(fix(deps({ TTE_ALLOW_MAC_E2E: '1' }), true)).toBe(2);
  });
  it('a run on commits that are not on origin/main launches nothing and reports red-unfixed', () => {
    writeRed();
    expect(fix(deps({}, (a) => (a[0] === 'merge-base' ? 1 : 0)), false)).toBe(0);
    expect(calls.some((c) => c.startsWith('claude') || / push /.test(c))).toBe(false);
    expect(readFileSync(join(dir, 'gate', 'nightly-fix-status.json'), 'utf8')).toContain('red-unfixed');
  });
});
