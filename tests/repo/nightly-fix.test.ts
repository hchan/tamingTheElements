import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fix, main, report, type FixDeps, type FixRun } from '../../tools/ci/nightly-fix';
import {
  addsSkipMarkers, buildPrompt, canStartFullRun, canStartRound, capTimeout, childFailed, claudeArgs, claudeEnv, collectUnfinished, deadlineFor, deadlineReached, DENIED_TOOLS, noPushEnv,
  extractFailures, finalState, forbiddenTouched, FULL_RUN_MS, isForbiddenPath, judgeFullRun, MAX_FULL_CYCLES, MAX_ROUNDS, parseNulList, parsePorcelainZ, parseTriage, pushBlockers, rerunStops,
  retargets, retryAllowed, roundAllowed, scrub, shouldRun, specPath, statusUsable, stopsLoop, titlePassed, TOOLS, triage,
  type PushInput,
} from '../../tools/ci/nightly-fix-logic';
import { finishStatus, pendingStatus } from '../../tools/ci/nightly-status';

describe('forbidden paths', () => {
  it.each([
    'src/core/sim/step.ts', 'src/core/version.ts', 'tests/fixtures/golden/a.json', 'tests/fixtures/balance/x.json', 'tools/ci/size-budget.json', 'docs/REPO-MAP.md',
    'src/game/assets/manifest.generated.json', 'package.json', 'pnpm-lock.yaml', 'CLAUDE.md', '.claude/settings.json', '.github/workflows/nightly.yml',
    'tools/ci/nightly-fix.ts', 'tools/ci/known-red.json', 'tools/gen/anything.ts', 'tests/repo/docs.test.ts', 'eslint.config.js', 'tsconfig.json', 'src/game/tsconfig.app.json',
    'playwright.config.ts', 'playwright.pages.config.ts', 'vitest.config.ts', 'vite.config.ts', '.dependency-cruiser.cjs',
    'war/WEB-INF/user.properties', '.env.local', 'keys/id_ed25519', 'x/server.pem', 'config/credentials.json',
    '.npmrc', '.pnpmfile.cjs', '.gitleaksignore', '.gitignore', '.gitattributes', 'public/assets/a.png', 'tests/visual/__baselines__/a.png', 'docs/TESTING.md', 'tests/browser/a.test.ts',
    '.claude/settings.local.json', 'node_modules/x/index.js', 'README.md',
    '../outside.ts', '/etc/passwd', './src//core/x.ts',
  ])('blocks %s', (p) => {
    expect(isForbiddenPath(p)).toBe(true);
  });
  it.each(['tests/e2e/menu.spec.ts', 'src/game/scenes/menu.ts', 'tests/e2e/helpers/wait.ts', 'src/corex/a.ts', 'src/game/a.ts'])('allows %s', (p) => {
    expect(isForbiddenPath(p)).toBe(false);
  });
  it('lists only the offenders and reads -z lists (renames, untracked)', () => {
    const out = ' M tests/e2e/a.spec.ts\0?? src/core/new.ts\0R  b.ts\0src/core/old.ts\0';
    expect(parsePorcelainZ(out)).toEqual(['tests/e2e/a.spec.ts', 'src/core/new.ts', 'b.ts', 'src/core/old.ts']);
    expect(forbiddenTouched(parsePorcelainZ(out))).toEqual(['src/core/new.ts', 'b.ts', 'src/core/old.ts']);
    expect(parseNulList('a\0b c\0')).toEqual(['a', 'b c']);
  });
});

describe('rounds, stops and green', () => {
  it('allows at most 3 rounds', () => {
    expect(MAX_ROUNDS).toBe(3);
    expect([0, 1, 2, 3, 4].map(roundAllowed)).toEqual([true, true, true, false, false]);
  });
  it('stops the loop on router exits 89/94/95/96, unknown codes, signals and timeouts, not on green/red', () => {
    for (const c of [89, 94, 95, 96, 93, 97, 130, 124]) expect(stopsLoop(c)).toBe(true);
    expect(stopsLoop(0)).toBe(false);
    expect(stopsLoop(1)).toBe(false);
    expect(rerunStops({ code: 1 })).toBe(false);
    expect(rerunStops({ code: 1, signal: 'SIGKILL' })).toBe(true);
    expect(rerunStops({ code: 0, timedOut: true })).toBe(true);
    expect([childFailed({ code: 0 }), childFailed({ code: 2 }), childFailed({ code: 0, signal: 'SIGTERM' }), childFailed({ code: 0, timedOut: true })]).toEqual([false, true, true, true]);
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
  it('green means the title passed, not skipped, not missing', () => {
    const j = (status: string, last: string) => ({ suites: [{ file: 'a.spec.ts', specs: [{ title: 't', file: 'a.spec.ts', tests: [{ status, results: [{ status: last }] }] }] }] });
    const ref = { file: 'tests/e2e/a.spec.ts', title: 't' };
    expect(titlePassed(j('expected', 'passed'), ref)).toBe(true);
    expect(titlePassed(j('skipped', 'skipped'), ref)).toBe(false);
    expect(titlePassed(j('unexpected', 'failed'), ref)).toBe(false);
    expect(titlePassed(j('expected', 'passed'), { file: 'a.spec.ts', title: 'other' })).toBe(false);
    expect(titlePassed(undefined, ref)).toBe(false);
  });
  it('rejects diffs that weaken the test', () => {
    for (const l of ['+  test.skip(true);', '+test.fixme(', '+ it.only(', '+  test.fail();', '+ retries: 2,']) expect(addsSkipMarkers(`--- a\n+++ b\n${l}`)).toHaveLength(1);
    for (const l of ['+ it.fails("x", () => {', '+ test.todo("x")', '+ xit("x", f)', '+ xdescribe("x", f)', '+ test.describe.configure({ mode: "serial" });']) expect(addsSkipMarkers(l)).toHaveLength(1);
    expect(addsSkipMarkers('- expect(a).toBe(1);\n+ await go();')).toHaveLength(1);
    expect(addsSkipMarkers('- expect(a).toBe(1);\n+ expect(a).toBe(2);')).toEqual([]);
    expect(addsSkipMarkers('+++ b/x.skip(\n- test.skip(\n+ await page.waitForSelector(".x");')).toEqual([]);
  });
  it('status usable: fresh, and for collect-and-fix collected this run; deadline 4 h or 22:00', () => {
    const s = finishStatus(pendingStatus('c'.repeat(40), 'raw-1', 's'), 1, { passed: 1, failed: [{ file: 'a', title: 'b' }], flaky: [] }, [], '2026-11-20T06:00:00.000Z', 'PC');
    const t = Date.parse('2026-11-20T07:00:00.000Z');
    expect(statusUsable(s, t)).toBe(true);
    expect(statusUsable(s, t + 40 * 3600_000)).toBe(false);
    expect(statusUsable(s, t, '2026-11-20T06:30:00.000Z')).toBe(false);
    expect(statusUsable(s, t, '2026-11-20T05:30:00.000Z')).toBe(true);
    const noon = new Date(2026, 10, 20, 12, 0, 0);
    expect(deadlineReached(noon.getTime(), noon)).toBe(false);
    expect(deadlineReached(noon.getTime() - 6 * 3600_000, noon)).toBe(true);
    expect(deadlineReached(noon.getTime(), new Date(2026, 10, 20, 22, 0, 0))).toBe(true);
  });
});

describe('cycle timing: deadline, retry wait, round and full-run budgets', () => {
  const at = (h: number, m = 0): Date => new Date(2026, 10, 20, h, m, 0);
  it('a night run (before 07:00) stops at 07:00 the same morning, a daytime run at 22:00', () => {
    expect(deadlineFor(at(2))).toEqual(at(7));
    expect(deadlineFor(at(6, 59))).toEqual(at(7));
    expect(deadlineFor(at(12))).toEqual(at(22));
    expect(deadlineFor(at(23)).getTime()).toBe(at(23).getTime());
    expect(deadlineReached(at(2).getTime(), at(6, 59))).toBe(false);
    expect(deadlineReached(at(2).getTime(), at(7))).toBe(true);
  });
  it('no round or full run starts that cannot finish before the deadline', () => {
    const start = at(2).getTime();
    expect(canStartRound(start, at(6, 40))).toBe(true);
    expect(canStartRound(start, at(6, 41))).toBe(false);
    expect(canStartFullRun(start, at(5, 30))).toBe(true);
    expect(canStartFullRun(start, at(5, 31))).toBe(false);
    expect(FULL_RUN_MS).toBe(90 * 60_000);
  });
  it('child timeouts are capped at the time left (at least a second)', () => {
    const start = at(2).getTime();
    expect(capTimeout(25 * 60_000, start, at(6, 50))).toBe(10 * 60_000);
    expect(capTimeout(25 * 60_000, start, at(3))).toBe(25 * 60_000);
    expect(capTimeout(25 * 60_000, start, at(8))).toBe(1000);
  });
  const pending = pendingStatus(SHA, 'raw-1', 's');
  const busy = { ...pending, state: 'not-run' as const, exit: 95, reason: 'PC busy' };
  it('unfinished = pending, or not-run for PC busy/unreachable; pass, red and other not-run are finished', () => {
    expect(collectUnfinished(pending)).toBe(true);
    expect(collectUnfinished(busy)).toBe(true);
    expect(collectUnfinished({ ...busy, exit: 94 })).toBe(true);
    expect(collectUnfinished({ ...busy, exit: 97 })).toBe(false);
    expect(collectUnfinished({ ...busy, state: 'red' })).toBe(false);
    expect(collectUnfinished(undefined)).toBe(false);
  });
  it('retries every 20 min while the next try starts by 04:30, never later', () => {
    const start = at(2);
    expect(retryAllowed(busy, start, at(2))).toBe(true);
    expect(retryAllowed(busy, start, at(4, 10))).toBe(true);
    expect(retryAllowed(busy, start, at(4, 11))).toBe(false);
    expect(retryAllowed({ ...busy, state: 'red' }, start, at(2))).toBe(false);
    expect(retryAllowed(busy, at(23), new Date(2026, 10, 21, 2, 0))).toBe(true);
    expect(retryAllowed(busy, at(23), new Date(2026, 10, 21, 4, 20))).toBe(false);
  });
  it('MAX_FULL_CYCLES is 2', () => {
    expect(MAX_FULL_CYCLES).toBe(2);
  });
});

describe('judging a full re-run', () => {
  const t = (title: string) => ({ file: 'menu.spec.ts', title });
  const known = [{ file: 'tests/e2e/menu.spec.ts', titleIncludes: 'known' }];
  it('a red absent from the pre-fix nightly is new (collateral); one that was red before is remaining', () => {
    const v = judgeFullRun({ passed: 5, failed: [t('opens'), t('collateral')], flaky: [] }, [t('opens')], []);
    expect(v.newReds).toEqual([t('collateral')]);
    expect(v.remaining).toEqual([t('opens')]);
  });
  it('flaky and known-red never count as new reds', () => {
    const v = judgeFullRun({ passed: 5, failed: [t('a known one')], flaky: [t('wobbly')] }, [t('opens')], known);
    expect(v).toEqual({ newReds: [], remaining: [] });
  });
  it('only a red whose fix did not hold is chased again', () => {
    const r = (title: string, outcome: 'fixed' | 'flaky' | 'needs-human' | 'unfixed') => ({ ...t(title), outcome, rounds: 1, reason: '' });
    const v = { newReds: [], remaining: [t('a'), t('b'), t('c'), t('d')] };
    expect(retargets(v, [r('a', 'fixed'), r('b', 'flaky'), r('c', 'needs-human'), r('d', 'unfixed')])).toEqual([t('a')]);
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

describe('prompt, triage line, sandbox and env', () => {
  const f = { file: 'menu.spec.ts', title: 'opens', message: 'Timeout 5000ms', tracePath: 'trace.zip' };
  it('prompt has spec, title, error, trace and the hard stops', () => {
    const p = buildPrompt(f, 2, 'still red');
    for (const s of ['tests/e2e/menu.spec.ts', 'opens', 'Timeout 5000ms', 'trace.zip', 'src/core', 'tests/fixtures', 'SIM_VERSION', 'tools/**', 'Round 2 of 3', 'still red']) expect(p).toContain(s);
  });
  it('parses the TRIAGE line, else none', () => {
    expect(parseTriage('x\nTRIAGE: {"verdict":"flaky","reason":"r"}\n')).toEqual({ verdict: 'flaky', reason: 'r' });
    expect(parseTriage('TRIAGE: {"verdict":"bogus"}').verdict).toBe('none');
    expect(parseTriage('nothing').verdict).toBe('none');
  });
  it('claude is sandboxed: no user or project settings, file tools only, budget cap, no shell', () => {
    const a = claudeArgs('p');
    expect(a.slice(0, 2)).toEqual(['-p', 'p']);
    expect(a).toContain('--restricted');
    expect(a).not.toContain('--setting-sources');
    expect(a[a.indexOf('--permission-prompts') + 1]).toBe('none');
    expect(a[a.indexOf('--model') + 1]).toBe('sonnet');
    const deny = (JSON.parse(a[a.indexOf('--settings') + 1] ?? '{}') as { permissions: { deny: string[] } }).permissions.deny;
    expect(deny).toEqual(expect.arrayContaining(['Edit(node_modules/**)', 'Write(node_modules/**)', 'Edit(.claude/**)', 'Write(.claude/**)']));
    expect(a).toContain('--strict-mcp-config');
    expect(a).toContain('--max-budget-usd');
    expect(a).not.toContain('--allowedTools');
    expect(a[a.indexOf('--tools') + 1]).toBe(TOOLS.join(','));
    expect(TOOLS.join(' ')).not.toMatch(/Bash|WebFetch|vitest/);
    expect(DENIED_TOOLS).toContain('Bash');
  });
  it('child env is an allowlist with pushes disabled', () => {
    const e = claudeEnv({ PATH: '/bin', HOME: '/h', SSH_AUTH_SOCK: '/s', GITHUB_TOKEN: 't', GIT_DIR: 'x', ANTHROPIC_API_KEY: 'k' });
    expect(e).toMatchObject({ PATH: '/bin', HOME: '/h', ANTHROPIC_API_KEY: 'k', GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'remote.origin.pushurl', GIT_CONFIG_VALUE_0: 'disabled:' });
    for (const k of ['SSH_AUTH_SOCK', 'GITHUB_TOKEN', 'GIT_DIR']) expect(e).not.toHaveProperty(k);
  });
  it('re-run and gate env: no credentials, pushes disabled', () => {
    const e = noPushEnv({ PATH: '/bin', SSH_AUTH_SOCK: '/s', GITHUB_TOKEN: 't', GH_TOKEN: 'g', GIT_ASKPASS: 'a' });
    expect(e).toMatchObject({ PATH: '/bin', GIT_CONFIG_KEY_0: 'remote.origin.pushurl', GIT_CONFIG_VALUE_0: 'disabled:' });
    for (const k of ['SSH_AUTH_SOCK', 'GITHUB_TOKEN', 'GH_TOKEN', 'GIT_ASKPASS']) expect(e).not.toHaveProperty(k);
  });
  it('specPath adds tests/e2e once', () => {
    expect(specPath('a.spec.ts')).toBe('tests/e2e/a.spec.ts');
    expect(specPath('tests/e2e/a.spec.ts')).toBe('tests/e2e/a.spec.ts');
  });
  it('extracts error (scrubbed of ANSI, hosts and absolute paths) and the trace name', () => {
    const msg = '\u001b[31mboom\u001b[0m at /Users/bob/repo/src/a.ts:1 and /srv/x/y.ts on 10.1.2.3 (tests/e2e/a.spec.ts:5) http://localhost:4173/a/b';
    const json = { suites: [{ file: 'a.spec.ts', specs: [{ title: 't', tests: [{ results: [{ status: 'failed', errors: [{ message: msg }], attachments: [{ name: 'trace', path: '/p/t.zip' }] }] }] }] }] };
    const [r] = extractFailures(json, [{ file: 'a.spec.ts', title: 't' }]);
    expect(r?.tracePath).toBe('t.zip');
    expect(r?.message).toContain('boom');
    expect(r?.message).toContain('tests/e2e/a.spec.ts:5');
    expect(r?.message).toContain('http://localhost:4173/a/b');
    for (const bad of ['/Users/bob', '/srv/x', '10.1.2.3', '\u001b']) expect(r?.message).not.toContain(bad);
    expect(scrub('C:\\Users\\bob\\x.ts')).toBe('<path>');
    expect(extractFailures(json, [{ file: 'a.spec.ts', title: 'gone' }])[0]?.message).toMatch(/no error text/);
  });
});

describe('group-run helper', () => {
  it('kills the process group on timeout and reports it', () => {
    const t0 = Date.now();
    const r = spawnSync(process.execPath, ['--import', 'tsx', resolve('tools/ci/group-run.ts'), resolve('.'), '400', 'sh', '-c', 'sleep 30 & wait'], { encoding: 'utf8', timeout: 20_000 });
    const o = JSON.parse(r.stdout.trim()) as { timedOut: boolean; signal: string | null };
    expect(o.timedOut).toBe(true);
    expect(o.signal).toBe('SIGKILL');
    expect(Date.now() - t0).toBeLessThan(15_000);
  });
});

const SHA = 'c'.repeat(40);
const BASE = 'a'.repeat(40);
const MOVED = 'd'.repeat(40);
const NOON = (): Date => new Date(2026, 10, 20, 12, 0, 0);

interface Scenario {
  claude?: Partial<FixRun>;
  names?: string;
  /** Files `find` reports as written since the marker (ignored files included). */
  written?: string;
  diff?: string;
  mergedNames?: string;
  rerunCode?: number;
  /** 1-based index of the first re-run that is red (exit 1). */
  rerunRedFrom?: number;
  gate?: number;
  originMoves?: boolean;
  headMoves?: boolean;
  commitCode?: number;
  failures?: number;
  env?: Record<string, string>;
  /** Titles that fail in the Nth full run (0-based); a run without an entry is all green. */
  fullReds?: string[][];
  /** Titles that are flaky (passed on retry) in every full run. */
  fullFlaky?: string[];
  /** Exit of the full run's submit and of its attach (default 0 and 0/1 by reds). */
  fullSubmit?: number;
  fullAttach?: number;
  /** Start of the fake clock (default noon); `sleep` advances it. */
  clock?: Date;
  /** Exit codes of the collect step's attach, one per try; the last repeats; a code of 1 writes a red result for `opens`. */
  collectCodes?: number[];
}

describe('nightly-fix command (fake runner)', () => {
  let dir: string;
  let out: string;
  let calls: string[];
  let envs: Record<string, Record<string, string | undefined>>;
  let sleeps: number[];
  let clock: Date;
  beforeEach(() => {
    sleeps = [];
    clock = NOON();
    mkdirSync(resolve('.scratch'), { recursive: true });
    dir = mkdtempSync(join(resolve('.scratch'), 'nightly-fix-test-'));
    out = '';
    calls = [];
    envs = {};
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const writeRed = (n = 1): void => {
    const failed = Array.from({ length: n }, (_, i) => ({ file: 'menu.spec.ts', title: i === 0 ? 'opens' : `opens ${String(i)}` }));
    const red = finishStatus(pendingStatus(SHA, 'raw-1', 's'), 1, { passed: 1, failed, flaky: [] }, [], new Date(2026, 10, 20, 6, 0, 0).toISOString(), 'PC');
    mkdirSync(join(dir, 'gate'), { recursive: true });
    writeFileSync(join(dir, 'gate', 'nightly-status.json'), JSON.stringify(red));
  };
  const status = (): { state: string; pushed: boolean; blockers: string[]; results: { outcome: string; reason: string }[] } =>
    JSON.parse(readFileSync(join(dir, 'gate', 'nightly-fix-status.json'), 'utf8')) as ReturnType<typeof status>;
  const pushes = (): string[] => calls.filter((c) => /^git .*push/.test(c));
  const claudeCalls = (): string[] => calls.filter((c) => c.startsWith('claude '));

  const deps = (sc: Scenario = {}): FixDeps => {
    let originCalls = 0;
    let reruns = 0;
    let commits = 0;
    let fullRuns = 0;
    let collects = 0;
    return {
      env: sc.env ?? {},
      repo: join(dir, 'repo'),
      statusDir: join(dir, 'gate'),
      now: () => (sc.clock ? clock : NOON()),
      sleep: (ms) => {
        sleeps.push(ms);
        clock = new Date(clock.getTime() + ms);
      },
      run: (cmd, args, _cwd, env) => {
        const line = [cmd, ...args].join(' ');
        calls.push(line);
        const ok = (stdout = '', code = 0): FixRun => ({ code, stdout, stderr: '' });
        if (cmd === 'claude') {
          envs['claude'] = env;
          return { ...ok('TRIAGE: {"verdict":"fixed","reason":"waits for the menu"}'), ...sc.claude };
        }
        if (cmd === 'corepack' && line.includes('--pc-detach')) return ok(`queued raw-9 in cpu-full\n`, sc.fullSubmit ?? 0);
        if (cmd === 'corepack' && line.includes('--pc-cancel')) return ok();
        if (cmd === 'corepack' && line.includes('--pc-attach')) {
          const to = env['PLAYWRIGHT_JSON_OUTPUT_FILE'];
          const spec = (title: string, status: string, last: string) => ({ title, file: 'menu.spec.ts', tests: [{ status, results: [{ status: last, errors: [{ message: 'boom' }] }] }] });
          if (line.includes('raw-9')) {
            const reds = sc.fullReds?.[fullRuns] ?? [];
            fullRuns++;
            const specs = [spec('other passing', 'expected', 'passed'), ...reds.map((x) => spec(x, 'unexpected', 'failed')), ...(sc.fullFlaky ?? []).map((x) => spec(x, 'flaky', 'passed'))];
            if (to) writeFileSync(to, JSON.stringify({ suites: [{ file: 'menu.spec.ts', specs }] }));
            return ok('', sc.fullAttach ?? (reds.length ? 1 : 0));
          }
          const code = sc.collectCodes ? (sc.collectCodes[Math.min(collects, sc.collectCodes.length - 1)] ?? 0) : 0;
          collects++;
          if (to && code === 1) writeFileSync(to, JSON.stringify({ suites: [{ file: 'menu.spec.ts', specs: [spec('opens', 'unexpected', 'failed')] }] }));
          return ok('', code);
        }
        if (cmd === 'corepack' && line.includes('e2e-route.ts')) {
          reruns++;
          envs['rerun'] = env;
          const code = sc.rerunCode ?? (sc.rerunRedFrom !== undefined && reruns >= sc.rerunRedFrom ? 1 : 0);
          const to = env['PLAYWRIGHT_JSON_OUTPUT_FILE'];
          if (to && code === 0) {
            const spec = { title: 'opens', file: 'menu.spec.ts', tests: [{ status: 'expected', results: [{ status: 'passed' }] }] };
            writeFileSync(to, JSON.stringify({ suites: [{ file: 'menu.spec.ts', specs: [spec] }] }));
          }
          return ok('', code);
        }
        if (cmd === 'corepack' && line.includes('gate:push')) {
          envs['gate'] = env;
          return ok('', sc.gate ?? 0);
        }
        if (cmd === 'find') return ok(sc.written ?? '');
        if (cmd !== 'git') return ok();
        switch (args[0]) {
          case 'rev-parse':
            if (args[1] === 'origin/main') return ok(`${++originCalls > 1 && sc.originMoves ? MOVED : BASE}\n`);
            return ok(`${sc.headMoves && claudeCalls().length > 0 ? MOVED : BASE}\n`);
          case 'diff':
            if (args.includes('--cached') && args.includes('--name-only')) return ok(sc.names ?? 'tests/e2e/menu.spec.ts\0');
            if (args.includes('--cached')) return ok(sc.diff ?? '+  await page.waitForSelector("#menu");\n');
            return ok(sc.mergedNames ?? 'tests/e2e/menu.spec.ts\0');
          case 'rev-list':
            return ok(`${String(commits)}\n`);
          case 'grep':
            return ok('', 1);
          case 'commit':
            if ((sc.commitCode ?? 0) === 0 && args.includes('-m') && !args.includes('--no-ff')) commits++;
            return ok('', sc.commitCode ?? 0);
          default:
            return ok();
        }
      },
      out: (s) => {
        out += s;
      },
      err: (s) => {
        out += s;
      },
    };
  };
  const go = (sc: Scenario = {}): number => {
    writeRed(sc.failures);
    if (sc.clock) clock = sc.clock;
    return fix(deps(sc), false, sc.clock ? { startMs: sc.clock.getTime() } : {});
  };
  const fullRunCalls = (): string[] => calls.filter((c) => c.includes('--pc-detach'));
  const kept = (): boolean => calls.some((c) => c.startsWith('git branch -f nightly-fix-kept/2026-11-20 nightly-fix/2026-11-20'));

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
    expect(out).toContain('FULL e2e');
    expect(out).toContain('--restricted');
    expect(calls).toEqual([]);
  });
  it('refuses with a Mac override in the environment', () => {
    writeRed();
    expect(fix(deps({ env: { TTE_ALLOW_MAC_E2E: '1' } }), true)).toBe(2);
  });
  it('a run on commits that are not on origin/main launches nothing and reports red-unfixed', () => {
    writeRed();
    const d = deps();
    const run = d.run;
    expect(fix({ ...d, run: (c, a, w, e, t) => (a[0] === 'merge-base' ? { code: 1, stdout: '', stderr: '' } : run(c, a, w, e, t)) }, false)).toBe(0);
    expect(claudeCalls()).toEqual([]);
    expect(pushes()).toEqual([]);
    expect(status().state).toBe('red-unfixed');
  });

  it('everything green: exactly one plain push of HEAD to main, a sandboxed claude, a merge worktree cleanup', () => {
    expect(go({ env: { SSH_AUTH_SOCK: '/s', PATH: '/bin', GITHUB_TOKEN: 't' } })).toBe(0);
    expect(pushes()).toEqual(['git push origin HEAD:main']);
    expect(pushes().some((c) => /--force|\s-f(\s|$)|\+HEAD|--force-with-lease/.test(c))).toBe(false);
    expect(status()).toMatchObject({ state: 'fixed-pushed', pushed: true });
    expect(claudeCalls()).toHaveLength(1);
    expect(envs['claude']).not.toHaveProperty('SSH_AUTH_SOCK');
    expect(envs['claude']).toMatchObject({ GIT_CONFIG_KEY_0: 'remote.origin.pushurl', GIT_CONFIG_VALUE_0: 'disabled:' });
    const commit = calls.find((c) => c.startsWith('git commit')) ?? '';
    expect(commit).toContain('Co-Authored-By: Claude Sonnet 5.5');
    expect(commit).toContain('nightly-fix: opens');
    expect(calls.some((c) => c.startsWith('git branch -D'))).toBe(true);
    expect(existsSync(join(dir, 'gate', 'nightly-fix.lock'))).toBe(false);
  });
  it('re-run and gate:push run without credentials and with pushes disabled', () => {
    go({ env: { SSH_AUTH_SOCK: '/s', GITHUB_TOKEN: 't' } });
    for (const k of ['rerun', 'gate']) {
      expect(envs[k]).not.toHaveProperty('SSH_AUTH_SOCK');
      expect(envs[k]).not.toHaveProperty('GITHUB_TOKEN');
      expect(envs[k]).toMatchObject({ GIT_CONFIG_VALUE_0: 'disabled:' });
    }
  });
  it('an ignored file written outside the allowlist (settings.local.json): no commit, no re-run, needs-human', () => {
    go({ written: './.claude/settings.local.json\n' });
    expect(calls.some((c) => c.startsWith('git commit') || c.includes('e2e-route.ts'))).toBe(false);
    expect(pushes()).toEqual([]);
    expect(status().state).toBe('needs-human');
  });
  it('reset cleans ignored files but keeps node_modules; the fix worktree and branch are removed afterwards', () => {
    go({ written: './.npmrc\n' });
    expect(calls).toContain('git clean -ffdx -e node_modules');
    expect(calls.filter((c) => c.startsWith('git worktree remove')).length).toBeGreaterThan(1);
    expect(calls.some((c) => c.startsWith('git branch -D nightly-fix/2026-11-20'))).toBe(true);
  });
  it('gate:push red keeps the fixes on the kept branch too', () => {
    go({ gate: 1 });
    expect(kept()).toBe(true);
  });
  it('gate:push red: no push', () => {
    go({ gate: 1 });
    expect(pushes()).toEqual([]);
    expect(status().blockers.join(' ')).toContain('gate:push failed');
  });
  it('a green full run of the fixed tree: one full run, then gate:push and one plain push', () => {
    go();
    expect(fullRunCalls()).toHaveLength(1);
    const full = calls.filter((c) => c.includes('e2e-route.ts'));
    expect(full.some((c) => c.includes('--full') && c.includes('--pc-detach'))).toBe(true);
    expect(full.some((c) => c.includes('--pc-attach raw-9'))).toBe(true);
    expect(full.every((c) => !/--local|--mac/.test(c))).toBe(true);
    expect(calls.findIndex((c) => c.includes('--pc-attach raw-9'))).toBeLessThan(calls.findIndex((c) => c.includes('gate:push')));
    expect(pushes()).toEqual(['git push origin HEAD:main']);
    expect(kept()).toBe(false);
  });
  it('the full run goes through the queue without credentials, never forcing the Mac', () => {
    go({ env: { SSH_AUTH_SOCK: '/s', GITHUB_TOKEN: 't' } });
    expect(envs['rerun']).not.toHaveProperty('SSH_AUTH_SOCK');
    expect(calls.filter((c) => c.includes('e2e-route.ts')).some((c) => c.includes('TTE_ALLOW_MAC_E2E'))).toBe(false);
  });
  it('collateral: a new red in the full re-run means no push, needs-human, and the fixes stay on a kept local branch', () => {
    go({ fullReds: [['collateral victim']] });
    expect(pushes()).toEqual([]);
    expect(calls.some((c) => c.includes('gate:push'))).toBe(false);
    expect(status().state).toBe('needs-human');
    expect(status().results.some((r) => r.outcome === 'needs-human' && r.reason.includes('collateral'))).toBe(true);
    expect(status().blockers.join(' ')).toContain('new reds');
    expect(kept()).toBe(true);
    expect(fullRunCalls()).toHaveLength(1);
  });
  it('flaky specs in the full run do not block the push and are never chased', () => {
    go({ fullFlaky: ['wobbly'] });
    expect(pushes()).toEqual(['git push origin HEAD:main']);
    expect(claudeCalls()).toHaveLength(1);
  });
  it('a fix that did not hold is chased once more, then a second full run decides (max 2 full runs)', () => {
    go({ fullReds: [['opens'], ['opens']] });
    expect(claudeCalls()).toHaveLength(2);
    expect(fullRunCalls()).toHaveLength(MAX_FULL_CYCLES);
    expect(pushes()).toEqual(['git push origin HEAD:main']); // opens was already red before: not a new red
  });
  it('a second cycle that comes back green pushes the twice-fixed tree', () => {
    go({ fullReds: [['opens'], []] });
    expect(claudeCalls()).toHaveLength(2);
    expect(fullRunCalls()).toHaveLength(2);
    expect(pushes()).toEqual(['git push origin HEAD:main']);
    expect(status().results.filter((r) => r.outcome === 'fixed')).toHaveLength(1);
  });
  it('a collateral red in the second full run also blocks the push', () => {
    go({ fullReds: [['opens'], ['opens', 'collateral victim']] });
    expect(fullRunCalls()).toHaveLength(2);
    expect(pushes()).toEqual([]);
    expect(kept()).toBe(true);
  });
  it('the full run did not finish (attach exit 95): nothing pushed, the full job is cancelled, fixes kept', () => {
    go({ fullAttach: 95 });
    expect(pushes()).toEqual([]);
    expect(calls.some((c) => c.includes('--pc-cancel raw-9'))).toBe(true);
    expect(status().blockers.join(' ')).toContain('did not finish');
    expect(kept()).toBe(true);
  });
  it('no job id from the full submit: nothing pushed', () => {
    go({ fullSubmit: 95 });
    expect(pushes()).toEqual([]);
    expect(status().blockers.join(' ')).toContain('did not finish');
  });
  it('too little time before 07:00 for a full run: fixes are kept, no full run starts, no push', () => {
    go({ clock: new Date(2026, 10, 20, 5, 45, 0) });
    expect(claudeCalls()).toHaveLength(1);
    expect(fullRunCalls()).toEqual([]);
    expect(pushes()).toEqual([]);
    expect(status().blockers.join(' ')).toContain('not enough time');
    expect(kept()).toBe(true);
  });
  it('past the hard stop: no round starts at all', () => {
    go({ clock: new Date(2026, 10, 20, 6, 50, 0) });
    expect(claudeCalls()).toEqual([]);
    expect(fullRunCalls()).toEqual([]);
    expect(pushes()).toEqual([]);
    expect(status().results[0]).toMatchObject({ outcome: 'unfixed' });
  });
  it('flaky and known-red specs never start a fix round: a status with no unrecorded failure does nothing', () => {
    const flakyOnly = finishStatus(pendingStatus(SHA, 'raw-1', 's'), 0, { passed: 5, failed: [], flaky: [{ file: 'menu.spec.ts', title: 'wobbly' }] }, [], new Date(2026, 10, 20, 6, 0, 0).toISOString(), 'PC');
    mkdirSync(join(dir, 'gate'), { recursive: true });
    writeFileSync(join(dir, 'gate', 'nightly-status.json'), JSON.stringify(flakyOnly));
    expect(fix(deps(), false)).toBe(0);
    expect(calls).toEqual([]);
  });
  it('origin moved during the run: no push', () => {
    go({ originMoves: true });
    expect(pushes()).toEqual([]);
    expect(status().blockers.join(' ')).toContain('origin/main moved');
  });
  it('a forbidden path in the diff: no commit, no re-run, needs-human', () => {
    go({ names: 'src/core/sim/step.ts\0' });
    expect(calls.some((c) => c.startsWith('git commit'))).toBe(false);
    expect(calls.some((c) => c.includes('e2e-route.ts'))).toBe(false);
    expect(pushes()).toEqual([]);
    expect(status().state).toBe('needs-human');
  });
  it('a diff that adds test.skip: no commit, needs-human', () => {
    go({ diff: '+  test.skip(true, "later");\n' });
    expect(calls.some((c) => c.startsWith('git commit'))).toBe(false);
    expect(status().results[0]?.reason).toContain('skip');
  });
  it('three red rounds: exactly three claude calls, then unfixed', () => {
    go({ rerunCode: 1 });
    expect(claudeCalls()).toHaveLength(3);
    expect(pushes()).toEqual([]);
    expect(status().results[0]).toMatchObject({ outcome: 'unfixed' });
  });
  it('router exit 95 stops the loop', () => {
    go({ rerunCode: 95, failures: 2 });
    expect(claudeCalls()).toHaveLength(1);
    expect(status().results.map((r) => r.outcome)).toEqual(['unfixed', 'unfixed']);
    expect(status().blockers.join(' ')).toContain('router exit 95');
  });
  it.each([
    ['non-zero exit', { code: 1 }],
    ['a signal', { code: 0, signal: 'SIGKILL' }],
    ['a timeout', { code: 0, timedOut: true }],
  ])('claude failing (%s): stops, no flaky, no commit, no push', (_n, claude) => {
    go({ claude, failures: 2 });
    expect(claudeCalls()).toHaveLength(1);
    expect(status().results.map((r) => r.outcome)).toEqual(['unfixed', 'unfixed']);
    expect(calls.some((c) => c.startsWith('git commit') || c.includes('e2e-route.ts'))).toBe(false);
    expect(pushes()).toEqual([]);
  });
  it('green with an empty diff is a flaky candidate in the report only: nothing committed or pushed', () => {
    go({ names: '', diff: '' });
    expect(status().results[0]).toMatchObject({ outcome: 'flaky' });
    expect(calls.some((c) => c.startsWith('git commit'))).toBe(false);
    expect(pushes()).toEqual([]);
    expect(status().state).toBe('red-unfixed');
  });
  it('the agent moving HEAD fails the round', () => {
    go({ headMoves: true });
    expect(status().results[0]).toMatchObject({ outcome: 'needs-human', reason: 'the agent moved HEAD' });
    expect(pushes()).toEqual([]);
  });
  it('a failing git commit records unfixed', () => {
    go({ commitCode: 1 });
    expect(status().results[0]).toMatchObject({ outcome: 'unfixed', reason: 'git commit failed' });
    expect(pushes()).toEqual([]);
  });
  it('more than 3 failures: needs-human report, no rounds, nothing launched', () => {
    go({ failures: 4 });
    expect(status().state).toBe('needs-human');
    expect(calls).toEqual([]);
  });
  it('skips a sha that was already handled', () => {
    writeRed();
    writeFileSync(join(dir, 'gate', 'nightly-fix-status.json'), JSON.stringify({ schema: 1, state: 'red-unfixed', sha: SHA, finishedAt: 'x', pushed: false, results: [], blockers: [] }));
    expect(fix(deps(), false)).toBe(0);
    expect(out).toContain('already handled');
    expect(calls).toEqual([]);
  });
  it('skips a status that this run did not collect', () => {
    writeRed();
    expect(fix(deps(), false, { notBefore: new Date(2026, 10, 20, 7, 0, 0).toISOString() })).toBe(0);
    expect(out).toContain('not collected by this run');
    expect(calls).toEqual([]);
  });
  it('one run at a time: a held lock launches nothing', () => {
    writeRed();
    writeFileSync(join(dir, 'gate', 'nightly-fix.lock'), 'x');
    expect(fix(deps(), false)).toBe(0);
    expect(out).toContain('lock');
    expect(calls).toEqual([]);
  });
  it('an exception writes a needs-human status and frees the lock', () => {
    writeRed();
    const d = deps();
    expect(fix({ ...d, run: () => { throw new Error('boom from /Users/bob/x'); } }, false)).toBe(1);
    expect(status().state).toBe('needs-human');
    expect(status().blockers.join(' ')).not.toContain('/Users/bob');
    expect(existsSync(join(dir, 'gate', 'nightly-fix.lock'))).toBe(false);
  });

  describe('collect-and-fix at 02:00', () => {
    const night = (): Date => new Date(2026, 10, 20, 2, 0, 0);
    const submitted = (): void => {
      mkdirSync(join(dir, 'gate'), { recursive: true });
      writeFileSync(join(dir, 'gate', 'nightly-status.json'), JSON.stringify(pendingStatus(SHA, 'raw-1', new Date(2026, 10, 19, 23, 0, 0).toISOString())));
    };
    const collectAttaches = (): string[] => calls.filter((c) => c.includes('--pc-attach raw-1'));
    it('waits 20 min and retries while the PC is busy, then fixes once the run is collected', () => {
      submitted();
      clock = night();
      expect(main(['collect-and-fix'], deps({ clock: night(), collectCodes: [95, 95, 1] }))).toBe(0);
      expect(collectAttaches()).toHaveLength(3);
      expect(sleeps).toEqual([20 * 60_000, 20 * 60_000]);
      expect(out).toContain('retrying in 20 min');
      expect(claudeCalls()).toHaveLength(1);
      expect(fullRunCalls()).toHaveLength(1);
      expect(status().state).toBe('fixed-pushed');
    });
    it('keeps retrying until 04:30, then gives up without a fix round (no skip-the-night crash)', () => {
      submitted();
      clock = night();
      expect(main(['collect-and-fix'], deps({ clock: night(), collectCodes: [95] }))).toBe(0);
      expect(collectAttaches()).toHaveLength(8);
      expect(clock.getTime()).toBeLessThanOrEqual(new Date(2026, 10, 20, 4, 30, 0).getTime());
      expect(claudeCalls()).toEqual([]);
      expect(pushes()).toEqual([]);
    });
    it('a finished green run needs no retry and no fix', () => {
      submitted();
      clock = night();
      expect(main(['collect-and-fix'], deps({ clock: night(), collectCodes: [0] }))).toBe(0);
      expect(sleeps).toEqual([]);
      expect(claudeCalls()).toEqual([]);
    });
    it('dry run collects nothing and sleeps never', () => {
      submitted();
      expect(main(['collect-and-fix', '--dry-run'], deps({ clock: night() }))).toBe(0);
      expect(sleeps).toEqual([]);
      expect(calls).toEqual([]);
    });
  });

  describe('07:00 morning report', () => {
    it('writes a read-only report from the nightly and fix status, and notes a live lock', () => {
      writeRed();
      writeFileSync(join(dir, 'gate', 'nightly-fix.lock'), 'x');
      expect(report(deps())).toBe(0);
      const md = readFileSync(join(dir, 'gate', 'nightly-morning-report.md'), 'utf8');
      expect(md).toContain('RED');
      expect(md).toContain('may still be running');
      expect(calls).toEqual([]);
    });
    it('exists even with no status at all', () => {
      expect(main(['report'], deps())).toBe(0);
      expect(readFileSync(join(dir, 'gate', 'nightly-morning-report.md'), 'utf8')).toContain('no status recorded');
    });
  });
});
