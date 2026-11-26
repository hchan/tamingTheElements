import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readStatus } from '../../tools/ci/nightly-e2e';
import { fix, main, readSpent, report, type FixDeps, type FixRun } from '../../tools/ci/nightly-fix';
import {
  addsSkipMarkers, buildPrompt, canStartFullRun, canStartRound, capTimeout, childFailed, claudeArgs, claudeEnv, collectUnfinished, deadlineFor, deadlineReached, DENIED_TOOLS, noPushEnv,
  extractFailures, finalState, forbiddenTouched, FULL_RUN_MS, isForbiddenPath, judgeFullRun, MAX_FULL_CYCLES, parseNulList, parsePorcelainZ, parseTriage, pushBlockers, rerunStops,
  retargets, retryAllowed, classifyReds, redsVerdict, dedupeRefs, blockingReds, knownRedProposal, byTier, errorSig, failureSpendAllowed, localDay, normalizeDiff, noProgress, spendAllowed, NIGHT_SPEND_CAP_USD, PER_FAILURE_SPEND_CAP_USD, ROUND_BUDGET_USD, scrub, shouldRun, specPath, statusUsable, stopsLoop, titlePassed, TOOLS, triage,
  type PushInput, morningReport, type FixStatus, type LandInput, LAND_MARGIN_MS, GATE_ESTIMATE_MS, canStartVerify, verifyVerdict, needsFullRun, integrationRefusals, landBlockers, mergedBranchName,
} from '../../tools/ci/nightly-fix-logic';
import type { PushStatus } from '../../tools/ci/nightly-push';
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
  it('no round-count cap: only the per-night spend cap (one constant) limits the rounds', () => {
    const last = NIGHT_SPEND_CAP_USD / ROUND_BUDGET_USD;
    expect(spendAllowed(0)).toBe(true);
    expect(spendAllowed(last - 1)).toBe(true);
    expect(spendAllowed(last)).toBe(false);
  });
  it('per-failure share: a third of the night cap', () => {
    expect(PER_FAILURE_SPEND_CAP_USD).toBe(NIGHT_SPEND_CAP_USD / 3);
    expect(failureSpendAllowed(PER_FAILURE_SPEND_CAP_USD / ROUND_BUDGET_USD - 1)).toBe(true);
    expect(failureSpendAllowed(PER_FAILURE_SPEND_CAP_USD / ROUND_BUDGET_USD)).toBe(false);
  });
  it('normalizeDiff drops comment-only and blank lines, keeps diff order, and treats # as a comment only in sh/yaml/py files', () => {
    expect(normalizeDiff('--- a/x.ts\n+++ b/x.ts\n+  // note\n+\n+ * doc\n+/* c */')).toBe('');
    expect(normalizeDiff('+  a(  1 );\n-b')).toBe('+a( 1 );\n-b');
    expect(normalizeDiff('+a\n+b')).not.toBe(normalizeDiff('+b\n+a')); // reordering statements is a real change
    expect(normalizeDiff('+++ b/x.ts\n+  #secret = 1;\n+#menu { color: red }')).toBe('+#secret = 1;\n+#menu { color: red }');
    expect(normalizeDiff('--- a/x.py\n+++ b/x.py\n+  # why\n+x = 1')).toBe('+x = 1');
    expect(normalizeDiff('--- a/x.ts\n+++ b/x.ts\n+--- not a header\n')).toBe('+--- not a header');
  });
  it('errorSig: first three lines, numbers masked on the first, durations everywhere, values kept so a different value is progress', () => {
    expect(errorSig('\n  Error: Timeout 5000ms waiting for #menu 3\nmore')).toBe('Error: Timeout #ms waiting for #menu # | more');
    expect(errorSig('Error: Timeout 7500ms waiting for 3 items')).toBe('Error: Timeout #ms waiting for # items');
    expect(errorSig('Error: width 2px')).toBe('Error: width #px');
    const m = (v: number) => `Error: expect(received).toBe(expected)\n\nExpected: 5\nReceived: ${String(v)}`;
    expect(errorSig(m(3))).not.toBe(errorSig(m(4)));
    expect(errorSig('Error: x\n\nExpected: 5\nReceived: 3 in 120ms')).toBe(errorSig('Error: x\n\nExpected: 5\nReceived: 3 in 9ms'));
    expect(errorSig('(no error text in the collected results)')).toBe('');
  });
  it('noProgress: any earlier same normalised diff (same base) or same error stops; the first round never does', () => {
    const sig = (diff: string, error = '', base = 'h0') => ({ base, diff: normalizeDiff(diff), error });
    const A = sig('+a');
    const B = sig('+b');
    expect(noProgress([], A)).toBe(false);
    expect(noProgress([A], B)).toBe(false);
    expect(noProgress([A, B], sig('+a'))).toBe(true); // A,B,A oscillation
    expect(noProgress([A], sig('+  a  '))).toBe(true); // whitespace only
    expect(noProgress([sig('+a')], sig('+a\n+// why'))).toBe(true); // comment only
    expect(noProgress([sig('+a\n+b')], sig('+b\n+a'))).toBe(false); // reordered statements are progress
    expect(noProgress([A], sig('+a', '', 'h1'))).toBe(false); // another base is a different change
    expect(noProgress([sig('+a', 'Error: x')], sig('+z', 'Error: x', 'h1'))).toBe(true);
    expect(noProgress([sig('+a', '')], sig('+b', ''))).toBe(false);
  });
  it('byTier orders P0 before P1 before P2, stable within a tier', () => {
    const tf = (t: { title: string }): 'P0' | 'P1' | 'P2' => (t.title.startsWith('z') ? 'P0' : t.title.startsWith('m') ? 'P2' : 'P1');
    const r = byTier([{ file: 'a', title: 'm1' }, { file: 'a', title: 'b1' }, { file: 'a', title: 'z1' }, { file: 'a', title: 'b2' }], tf);
    expect(r.map((x) => x.title)).toEqual(['z1', 'b1', 'b2', 'm1']);
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
    expect(triage({ ...base, rerunExit: 1, round: 30 }).outcome).toBe('retry');
    expect(triage({ ...base, rerunExit: 1, round: 2, noProgress: true }).outcome).toBe('needs-human');
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
    expect(canStartRound(start, at(6, 25))).toBe(true); // a claude round plus a re-run: 20 + 15 min
    expect(canStartRound(start, at(6, 26))).toBe(false);
    expect(canStartFullRun(start, at(5, 15))).toBe(true); // 90 min full run plus a 15 min gate:push
    expect(canStartFullRun(start, at(5, 16))).toBe(false);
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
  });
  it('a daytime manual run never waits past its own hard stop minus one round', () => {
    expect(retryAllowed(busy, at(10), at(10))).toBe(true);
    expect(retryAllowed(busy, at(10), at(21, 30))).toBe(false);
    expect(retryAllowed(busy, at(10), at(23))).toBe(false);
  });
  it('MAX_FULL_CYCLES is 2', () => {
    expect(MAX_FULL_CYCLES).toBe(2);
  });
});

describe('classifyReds', () => {
  const tierFor = (t: { file: string }): 'P0' | 'P1' | 'P2' => (t.file.startsWith('polish') ? 'P2' : t.file.startsWith('core') ? 'P0' : 'P1');
  const ref = (file: string, title: string) => ({ file, title });
  const pass = (t: { file: string; title: string }): unknown => ({ suites: [{ file: t.file, specs: [{ title: t.title, tests: [{ status: 'expected', results: [{ status: 'passed' }] }] }] }] });
  const fail = (t: { file: string; title: string }): unknown => ({ suites: [{ file: t.file, specs: [{ title: t.title, tests: [{ status: 'unexpected', results: [{ status: 'failed' }] }] }] }] });
  const both = (a: { file: string; title: string }, b: { file: string; title: string }): unknown => ({ suites: [...(pass(a) as { suites: unknown[] }).suites, ...(fail(b) as { suites: unknown[] }).suites] });
  it.each([
    ['passed on retry, P1', 'x.spec.ts', 'ran-pass', 'flaky-on-retry'],
    ['passed on retry, P2', 'polish.spec.ts', 'ran-pass', 'flaky-on-retry'],
    ['failed on retry, P1', 'x.spec.ts', 'ran-fail', 'real'],
    ['failed on retry, P0', 'core.spec.ts', 'ran-fail', 'real'],
    ['failed on retry, P2', 'polish.spec.ts', 'ran-fail', 'p2-record'],
    ['router stopped, P1', 'x.spec.ts', 'stopped', 'unclassified'],
    ['router stopped, P2', 'polish.spec.ts', 'stopped', 'unclassified'],
  ])('%s', (_n, file, how, cls) => {
    const t = ref(file, 't');
    const retry = how === 'stopped' ? ({ kind: 'stopped', reason: 'router exit 94' } as const) : ({ kind: 'ran', json: how === 'ran-pass' ? pass(t) : fail(t) } as const);
    expect(classifyReds([t], retry, tierFor)[0]).toMatchObject({ cls });
  });
  it('a title missing from the retry results is real, not flaky', () => {
    expect(classifyReds([ref('x.spec.ts', 't')], { kind: 'ran', json: { suites: [] } }, tierFor)[0]?.cls).toBe('real');
  });
  it('6 entries -> 4 distinct -> 2 flaky + 2 P2 -> clean-push; a real P1 blocks; 40 real reds are still fixed (no broken night)', () => {
    const six = [ref('a.spec.ts', 'a'), ref('a.spec.ts', 'a'), ref('b.spec.ts', 'b'), ref('b.spec.ts', 'b'), ref('polish.spec.ts', 'c'), ref('polish2.spec.ts', 'd')];
    expect(dedupeRefs(six)).toHaveLength(4);
    const json = { suites: [...(pass(ref('a.spec.ts', 'a')) as { suites: unknown[] }).suites, ...(pass(ref('b.spec.ts', 'b')) as { suites: unknown[] }).suites, ...(fail(ref('polish.spec.ts', 'c')) as { suites: unknown[] }).suites, ...(fail(ref('polish2.spec.ts', 'd')) as { suites: unknown[] }).suites] };
    const c = classifyReds(six, { kind: 'ran', json }, tierFor);
    expect(c.map((r) => r.cls)).toEqual(['flaky-on-retry', 'flaky-on-retry', 'p2-record', 'p2-record']);
    expect(redsVerdict(c)).toBe('clean-push');
    expect(blockingReds(c)).toEqual([]);
    expect(knownRedProposal(c[2] as (typeof c)[number], '2026-11-25')).toContain('"titleIncludes":"c"');
    const withReal = classifyReds([...six, ref('x.spec.ts', 'z')], { kind: 'ran', json: both(ref('a.spec.ts', 'a'), ref('x.spec.ts', 'z')) }, tierFor);
    expect(redsVerdict(withReal)).toBe('fix');
    const many = Array.from({ length: 40 }, (_, i) => ref('x.spec.ts', `t${String(i)}`));
    expect(redsVerdict(classifyReds(many, { kind: 'ran', json: { suites: [] } }, tierFor))).toBe('fix');
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
    for (const s of ['tests/e2e/menu.spec.ts', 'opens', 'Timeout 5000ms', 'trace.zip', 'src/core', 'tests/fixtures', 'SIM_VERSION', 'tools/**', 'Round 2', 'still red']) expect(p).toContain(s);
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
/** The merge commit M built in the detached merge worktree, and a tree id for the predicted/actual merge. */
const MERGED = 'b'.repeat(40);
const TREE = 'e'.repeat(40);
/** A merged diff that leaves the re-run spec, so the collateral full run is needed. */
const WIDE = 'tests/e2e/menu.spec.ts\0src/game/x.ts\0';
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
  /** Verify rounds (1-based) whose same-spec run on the merged commit is red. */
  verifyRed?: number[];
  /** The repo checkout has tracked changes: integrateMain refuses. */
  dirtyMain?: boolean;
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
  /** Every claude call advances the fake clock by this many ms (the 07:00 stop tests). */
  claudeMs?: number;
  /** Each staged diff differs (a new change every round); without it every round leaves the same diff. */
  varyDiff?: boolean;
  /** Error message of a red per-spec re-run (its signature is compared round to round). */
  rerunError?: string;
  /** 1-based router re-run calls (verify runs count too) that are red. */
  rerunRedOn?: number[];
  /** Staged diff per claude round (cycled), instead of `diff`. */
  diffs?: string[];
  /** From the second claude call on the agent answers like this instead of `claude`. */
  claudeLater?: Partial<FixRun>;
  /** The per-spec re-run / gate:commit time out after the fake clock advanced by this many ms. */
  rerunTimeoutMs?: number;
  gateTimeoutMs?: number;
  /** From the second claude call on, the staged names are this (an empty diff). */
  namesLater?: string;
  /** Exit codes of the collect step's attach, one per try; the last repeats; a code of 1 writes a red result for `opens`. */
  collectCodes?: number[];
  /** Specs in the pre-fix nightly-results.json (all passed). */
  preSpecs?: number;
  /** Playwright stats of every full run. */
  fullStats?: Record<string, number>;
  /** The first kept-branch name already exists. */
  keptExists?: boolean;
  /** The classify retry: titles that pass on it (default none: every red is real) and its router exit (default 0 when all pass, else 1). */
  classifyPass?: string[];
  classifyExit?: number;
  /** The clock jumps here once the first full run was attached. */
  jumpAfterFull?: Date;
}

describe('nightly-fix command (fake runner)', () => {
  let dir: string;
  let out: string;
  let calls: string[];
  let envs: Record<string, Record<string, string | undefined>>;
  let sleeps: number[];
  let clock: Date;
  let diffSeq = 0;
  let timeoutEnds: number[] = [];
  beforeEach(() => {
    sleeps = [];
    clock = NOON();
    diffSeq = 0;
    timeoutEnds = [];
    mkdirSync(resolve('.scratch'), { recursive: true });
    dir = mkdtempSync(join(resolve('.scratch'), 'nightly-fix-test-'));
    out = '';
    calls = [];
    classifies = [];
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
  const status = (): { state: string; pushed: boolean; blockers: string[]; results: { outcome: string; reason: string }[]; integrated?: boolean; mergeSha?: string; pushedSha?: string; mergedBranch?: string; keptBranch?: string } =>
    JSON.parse(readFileSync(join(dir, 'gate', 'nightly-fix-status.json'), 'utf8')) as ReturnType<typeof status>;
  const lockSeen: boolean[] = [];
  let classifies: string[] = [];
  const pushes = (): string[] => calls.filter((c) => /^git (?:-C \S+ )?push( |$)/.test(c));
  const claudeCalls = (): string[] => calls.filter((c) => c.startsWith('claude '));

  const deps = (sc: Scenario = {}): FixDeps => {
    let originCalls = 0;
    let reruns = 0;
    let commits = 0;
    let fullRuns = 0;
    let collects = 0;
    let mainAt = BASE;
    return {
      env: sc.env ?? {},
      repo: join(dir, 'repo'),
      statusDir: join(dir, 'gate'),
      now: () => (sc.clock ? clock : NOON()),
      sleep: (ms) => {
        sleeps.push(ms);
        clock = new Date(clock.getTime() + ms);
      },
      run: (cmd, args, cwd, env, timeout) => {
        const line = [cmd, ...args].join(' ');
        calls.push(line);
        if (timeout !== undefined && (cmd === 'claude' || line.includes('e2e-route.ts'))) timeoutEnds.push(clock.getTime() + timeout);
        const ok = (stdout = '', code = 0): FixRun => ({ code, stdout, stderr: '' });
        if (cmd === 'claude') {
          envs['claude'] = env;
          if (sc.claudeMs) clock = new Date(clock.getTime() + sc.claudeMs);
          return { ...ok('TRIAGE: {"verdict":"fixed","reason":"waits for the menu"}'), ...(sc.claudeLater && claudeCalls().length >= 2 ? sc.claudeLater : sc.claude) };
        }
        if (cmd === 'corepack' && line.includes('--pc-detach')) envs['detach'] = env;
        if (cmd === 'corepack' && line.includes('--pc-detach')) return ok(`queued raw-9 in cpu-full\n`, sc.fullSubmit ?? 0);
        if (cmd === 'corepack' && line.includes('--pc-cancel')) return ok();
        if (cmd === 'corepack' && line.includes('--pc-attach')) {
          if (line.includes('raw-9')) envs['attach'] = env;
          else lockSeen.push(existsSync(join(dir, 'gate', 'nightly-fix.lock')));
          const to = env['PLAYWRIGHT_JSON_OUTPUT_FILE'];
          const spec = (title: string, status: string, last: string) => ({ title, file: 'menu.spec.ts', tests: [{ status, results: [{ status: last, errors: [{ message: 'boom' }] }] }] });
          if (line.includes('raw-9')) {
            const reds = sc.fullReds?.[fullRuns] ?? [];
            fullRuns++;
            const specs = [spec('other passing', 'expected', 'passed'), ...reds.map((x) => spec(x, 'unexpected', 'failed')), ...(sc.fullFlaky ?? []).map((x) => spec(x, 'flaky', 'passed'))];
            if (to) writeFileSync(to, JSON.stringify({ stats: sc.fullStats ?? {}, suites: [{ file: 'menu.spec.ts', specs }] }));
            if (sc.jumpAfterFull && fullRuns === 1) clock = sc.jumpAfterFull;
            return ok('', sc.fullAttach ?? (reds.length ? 1 : 0));
          }
          const code = sc.collectCodes ? (sc.collectCodes[Math.min(collects, sc.collectCodes.length - 1)] ?? 0) : 0;
          collects++;
          if (to && code === 1) writeFileSync(to, JSON.stringify({ suites: [{ file: 'menu.spec.ts', specs: [spec('opens', 'unexpected', 'failed')] }] }));
          return ok('', code);
        }
        if (cmd === 'corepack' && line.includes('e2e-route.ts') && env['PLAYWRIGHT_JSON_OUTPUT_FILE']?.endsWith('nightly-fix-classify.json')) {
          classifies.push(line);
          const reds = Array.from({ length: sc.failures ?? 1 }, (_, i) => (i === 0 ? 'opens' : `opens ${String(i)}`));
          const pass = sc.classifyPass ?? [];
          const specs = reds.map((t) => ({ title: t, file: 'menu.spec.ts', tests: [{ status: pass.includes(t) ? 'expected' : 'unexpected', results: [{ status: pass.includes(t) ? 'passed' : 'failed' }] }] }));
          writeFileSync(env['PLAYWRIGHT_JSON_OUTPUT_FILE'], JSON.stringify({ suites: [{ file: 'menu.spec.ts', specs }] }));
          return ok('', sc.classifyExit ?? (reds.every((t) => pass.includes(t)) ? 0 : 1));
        }
        if (cmd === 'corepack' && line.includes('e2e-route.ts')) {
          reruns++;
          if (sc.rerunTimeoutMs && !env['PLAYWRIGHT_JSON_OUTPUT_FILE']?.includes('classify')) {
            clock = new Date(clock.getTime() + sc.rerunTimeoutMs);
            return { code: 1, stdout: '', stderr: '', timedOut: true };
          }
          envs['rerun'] = env;
          const vm = /nightly-fix-verify-(\d+)\.json$/.exec(env['PLAYWRIGHT_JSON_OUTPUT_FILE'] ?? '');
          const vRed = vm !== null && (sc.verifyRed ?? []).includes(Number(vm[1]));
          const code = sc.rerunCode ?? (vRed || (sc.rerunRedFrom !== undefined && reruns >= sc.rerunRedFrom) || (sc.rerunRedOn ?? []).includes(reruns) ? 1 : 0);
          if (vRed && env['PLAYWRIGHT_JSON_OUTPUT_FILE']) {
            const specs = [{ title: 'opens', file: 'menu.spec.ts', tests: [{ status: 'unexpected', results: [{ status: 'failed' }] }] }];
            writeFileSync(env['PLAYWRIGHT_JSON_OUTPUT_FILE'], JSON.stringify({ suites: [{ file: 'menu.spec.ts', specs }] }));
          }
          const to = env['PLAYWRIGHT_JSON_OUTPUT_FILE'];
          if (to && code === 1 && !vRed) {
            const specs = [{ title: 'opens', file: 'menu.spec.ts', tests: [{ status: 'unexpected', results: [{ status: 'failed', errors: [{ message: sc.rerunError ?? '' }] }] }] }];
            writeFileSync(to, JSON.stringify({ suites: [{ file: 'menu.spec.ts', specs }] }));
          }
          if (to && code === 0) {
            const specs = Array.from({ length: sc.failures ?? 1 }, (_, i) => ({ title: i === 0 ? 'opens' : `opens ${String(i)}`, file: 'menu.spec.ts', tests: [{ status: 'expected', results: [{ status: 'passed' }] }] }));
            writeFileSync(to, JSON.stringify({ suites: [{ file: 'menu.spec.ts', specs }] }));
          }
          return ok('', code);
        }
        if (cmd === 'corepack' && line.includes('gate:commit')) {
          envs['gate'] = env;
          if (sc.gateTimeoutMs) {
            clock = new Date(clock.getTime() + sc.gateTimeoutMs);
            return { code: 1, stdout: '', stderr: '', timedOut: true };
          }
          return ok('', sc.gate ?? 0);
        }
        if (cmd === 'find') return ok(sc.written ?? '');
        if (cmd !== 'git') return ok();
        const git = args[0] === '--no-optional-locks' ? args.slice(1) : args;
        switch (git[0]) {
          case 'rev-parse':
            if (git[1] === '--git-path') return ok(`.git/${git[2] ?? ''}\n`);
            if (git.some((a) => a.endsWith('^{tree}'))) return ok(`${TREE}\n`);
            if (git.includes('refs/heads/main')) return ok(`${mainAt}\n`);
            if (git.some((a) => a.startsWith('refs/heads/nightly-fix-merged/'))) return git.includes('-q') ? ok('', 1) : ok(`${MERGED}\n`);
            if (git[1] === 'origin/main') return ok(`${++originCalls > 1 && sc.originMoves ? MOVED : BASE}\n`);
            if (git[1] === 'HEAD' && cwd.includes('nightly-fix-merge')) return ok(`${MERGED}\n`);
            return ok(`${sc.headMoves && claudeCalls().length > 0 ? MOVED : BASE}\n`);
          case 'symbolic-ref':
            return ok('refs/heads/main\n');
          case 'worktree':
            return git[1] === 'list' ? ok(`worktree ${join(dir, 'repo')}\nHEAD ${BASE}\nbranch refs/heads/main\n`) : ok();
          case 'status':
            return ok(sc.dirtyMain && !cwd.includes('nightly-fix-merge') ? ' M src/x.ts\n' : '');
          case 'merge-tree':
            return ok(`${TREE}\n`);
          case 'merge-base':
            // M is not yet in main or origin; main is in M; origin/main is in M unless it moved.
            if (git[2] === MERGED && git[3] === BASE) return ok('', 1);
            if (git[2] === MERGED && git[3] === 'refs/remotes/origin/main') return ok('', 1);
            if (git[2] === 'refs/remotes/origin/main' && git[3] === MERGED && sc.originMoves) return ok('', 1);
            return ok();
          case 'merge':
            if (git.includes('--ff-only')) mainAt = MERGED;
            return ok();
          case 'push':
            return ok();
          case 'diff':
            if (args.includes('--cached') && args.includes('--name-only')) return ok(sc.namesLater !== undefined && claudeCalls().length >= 2 ? sc.namesLater : (sc.names ?? 'tests/e2e/menu.spec.ts\0'));
            if (args.includes('--cached')) return ok(`${sc.diffs ? (sc.diffs[(claudeCalls().length - 1) % sc.diffs.length] ?? '') : (sc.diff ?? '+  await page.waitForSelector("#menu");\n')}${sc.varyDiff ? `+  tick(${String(++diffSeq)});\n` : ''}`);
            return ok(sc.mergedNames ?? 'tests/e2e/menu.spec.ts\0');
          case 'rev-list':
            if (args.some((a) => a === `origin/main..${SHA}`)) return ok('3\n'); // the tested commit is ahead of origin
            return ok(`${String(commits)}\n`);
          case 'branch':
            return ok(sc.keptExists && args[1] === '--list' && args[2] === 'nightly-fix-kept/2026-11-20' ? 'nightly-fix-kept/2026-11-20\n' : '');
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
    if (sc.preSpecs !== undefined) {
      const specs = Array.from({ length: sc.preSpecs }, (_, i) => ({ title: `pre ${String(i)}`, file: 'menu.spec.ts', tests: [{ status: 'expected', results: [{ status: 'passed' }] }] }));
      writeFileSync(join(dir, 'gate', 'nightly-results.json'), JSON.stringify({ stats: {}, suites: [{ file: 'menu.spec.ts', specs }] }));
    }
    if (sc.jumpAfterFull && !sc.clock) clock = new Date(2026, 10, 20, 2, 0, 0);
    if (sc.clock) clock = sc.clock;
    const startAt = sc.clock ?? (sc.jumpAfterFull ? new Date(2026, 10, 20, 2, 0, 0) : undefined);
    return fix(deps({ ...sc, clock: startAt ?? sc.clock }), false, startAt ? { startMs: startAt.getTime() } : {});
  };
  const fullRunCalls = (): string[] => calls.filter((c) => c.includes('--pc-detach'));
  const kept = (): boolean => calls.some((c) => c.startsWith('git branch nightly-fix-kept/2026-11-20 nightly-fix/2026-11-20'));

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

  it('a verified fix lands: merge built on the tested sha, one plain push of M, F deleted, local main advanced', () => {
    expect(go({ env: { SSH_AUTH_SOCK: '/s', PATH: '/bin', GITHUB_TOKEN: 't' } })).toBe(0);
    expect(pushes()).toEqual([`git push origin ${MERGED}:main`]);
    expect(pushes().some((c) => /--force|\s-f(\s|$)|\+|--force-with-lease/.test(c))).toBe(false);
    expect(status()).toMatchObject({ state: 'fixed-pushed', pushed: true, integrated: true, mergeSha: MERGED, pushedSha: MERGED });
    expect(claudeCalls()).toHaveLength(1);
    expect(envs['claude']).not.toHaveProperty('SSH_AUTH_SOCK');
    expect(envs['claude']).toMatchObject({ GIT_CONFIG_KEY_0: 'remote.origin.pushurl', GIT_CONFIG_VALUE_0: 'disabled:' });
    const commit = calls.find((c) => c.startsWith('git commit')) ?? '';
    expect(commit).toContain('Co-Authored-By: Claude Sonnet 5.5');
    expect(commit).toContain('nightly-fix: opens');
    expect(calls.some((c) => c.includes('worktree add --detach') && c.endsWith(` ${SHA}`))).toBe(true);
    expect(calls.some((c) => c.includes('merge --no-ff nightly-fix/2026-11-20'))).toBe(true);
    expect(calls.some((c) => c.includes('merge --ff-only'))).toBe(true);
    expect(calls.some((c) => c.startsWith('git branch -D nightly-fix/2026-11-20'))).toBe(true);
    expect(kept()).toBe(false);
    expect(calls.some((c) => c.includes('gate:push'))).toBe(false);
    expect(existsSync(join(dir, 'gate', 'nightly-fix.lock'))).toBe(false);
  });
  it('the re-run, gate:commit and full run use no credentials and disabled pushes', () => {
    go({ env: { SSH_AUTH_SOCK: '/s', GITHUB_TOKEN: 't' } });
    for (const k of ['rerun', 'gate']) {
      expect(envs[k]).not.toHaveProperty('SSH_AUTH_SOCK');
      expect(envs[k]).not.toHaveProperty('GITHUB_TOKEN');
      expect(envs[k]).toMatchObject({ GIT_CONFIG_VALUE_0: 'disabled:' });
    }
  });
  it('an ignored file written outside the allowlist (settings.local.json): no commit, no re-run, needs-human', () => {
    go({ written: './.claude/settings.local.json\n' });
    expect(calls.some((c) => c.startsWith('git commit') || (c.includes('e2e-route.ts') && !classifies.includes(c)))).toBe(false);
    expect(pushes()).toEqual([]);
    expect(status().state).toBe('needs-human');
  });
  it('reset cleans ignored files but keeps node_modules; the fix worktree and branch are removed afterwards', () => {
    go({ written: './.npmrc\n' });
    expect(calls).toContain('git clean -ffdx -e node_modules');
    expect(calls.filter((c) => c.startsWith('git worktree remove')).length).toBeGreaterThan(1);
    expect(calls.some((c) => c.startsWith('git branch -D nightly-fix/2026-11-20'))).toBe(true);
  });
  it('gate:commit red: no push, needs-human with a gate tail, the fixes stay on the kept branch', () => {
    go({ gate: 1 });
    expect(pushes()).toEqual([]);
    expect(kept()).toBe(true);
    expect(status().state).toBe('needs-human');
    expect(status().blockers.join(' ')).toContain('gate:commit failed');
    expect(calls.some((c) => c.includes('gate:push'))).toBe(false);
  });
  it('a diff inside the re-run specs needs no collateral full run', () => {
    go();
    expect(fullRunCalls()).toEqual([]);
  });
  it('a collateral full run is triggered when the merged diff leaves the re-run specs, green runs push M', () => {
    go({ mergedNames: WIDE });
    expect(fullRunCalls()).toHaveLength(1);
    const full = calls.filter((c) => c.includes('e2e-route.ts'));
    expect(full.some((c) => c.includes('--full') && c.includes('--pc-detach'))).toBe(true);
    expect(full.some((c) => c.includes('--pc-attach raw-9'))).toBe(true);
    expect(full.every((c) => !/--local|--mac/.test(c))).toBe(true);
    expect(calls.findIndex((c) => c.includes('gate:commit'))).toBeLessThan(calls.findIndex((c) => c.includes('--pc-attach raw-9')));
    expect(pushes()).toEqual([`git push origin ${MERGED}:main`]);
    expect(kept()).toBe(false);
  });
  it('the full run goes through the queue without credentials, never forcing the Mac', () => {
    go({ mergedNames: WIDE, env: { SSH_AUTH_SOCK: '/s', GITHUB_TOKEN: 't' } });
    for (const k of ['detach', 'attach']) {
      expect(envs[k]).toBeDefined();
      for (const bad of ['SSH_AUTH_SOCK', 'GITHUB_TOKEN', 'TTE_ALLOW_MAC_E2E', 'TTE_E2E_LOCAL', 'CI']) expect(envs[k]).not.toHaveProperty(bad);
      expect(envs[k]?.['TTE_E2E_VIA_QUEUE']).toBe('1');
    }
    expect(calls.filter((c) => c.includes('e2e-route.ts')).some((c) => c.includes('TTE_ALLOW_MAC_E2E'))).toBe(false);
  });
  it('collateral: a new red in the full run means no push, needs-human, and the fixes stay on a kept local branch', () => {
    go({ mergedNames: WIDE, fullReds: [['collateral victim']] });
    expect(pushes()).toEqual([]);
    expect(status().state).toBe('needs-human');
    expect(status().results.some((r) => r.outcome === 'needs-human' && r.reason.includes('collateral'))).toBe(true);
    expect(status().blockers.join(' ')).toContain('new reds');
    expect(kept()).toBe(true);
    expect(fullRunCalls()).toHaveLength(1);
  });
  it('flaky specs in the full run do not block the push', () => {
    go({ mergedNames: WIDE, fullFlaky: ['wobbly'] });
    expect(pushes()).toEqual([`git push origin ${MERGED}:main`]);
    expect(claudeCalls()).toHaveLength(1);
  });
  it('the full run did not finish (attach exit 95): nothing pushed, the full job is cancelled, fixes kept', () => {
    go({ mergedNames: WIDE, fullAttach: 95 });
    expect(pushes()).toEqual([]);
    expect(calls.some((c) => c.includes('--pc-cancel raw-9'))).toBe(true);
    expect(status().blockers.join(' ')).toContain('did not finish');
    expect(kept()).toBe(true);
  });
  it('no job id from the full submit: nothing pushed', () => {
    go({ mergedNames: WIDE, fullSubmit: 95 });
    expect(pushes()).toEqual([]);
    expect(status().blockers.join(' ')).toContain('did not finish');
  });
  it.each([
    ['fewer specs than the pre-fix nightly', { preSpecs: 3 }, 'specs ran'],
    ['an interrupted run', { fullStats: { interrupted: 1 } }, 'interrupted'],
    ['a surge of skipped tests', { fullStats: { skipped: 40 } }, 'skipped'],
  ])('an incomplete full run (%s) is not verified: no push, needs-human, branch kept', (_n, sc, why) => {
    go({ ...sc, mergedNames: WIDE });
    expect(pushes()).toEqual([]);
    expect(status().state).toBe('needs-human');
    expect(status().blockers.join(' ')).toContain(why);
    expect(kept()).toBe(true);
  });
  it('verify red three times: no round cap, a fourth round (new diff each time) turns green and pushes M', () => {
    go({ verifyRed: [1, 2, 3], varyDiff: true });
    expect(claudeCalls()).toHaveLength(4);
    expect(pushes()).toEqual([`git push origin ${MERGED}:main`]);
  });
  it('a round that turns green after a red verify still lands (round 2 pushes M)', () => {
    go({ verifyRed: [1] });
    expect(claudeCalls()).toHaveLength(2);
    expect(pushes()).toEqual([`git push origin ${MERGED}:main`]);
  });
  it('integration refused (dirty main checkout): no push, the merge is kept on its own branch, F is not deleted blindly', () => {
    go({ dirtyMain: true });
    expect(pushes()).toEqual([]);
    expect(calls.some((c) => c.includes('merge --ff-only') || c.includes('merge --no-ff') && c.includes('--no-edit'))).toBe(false);
    expect(status().integrated).toBe(false);
    expect(status().blockers.join(' ')).toContain('integration refused');
    expect(status()).toMatchObject({ pushed: false, mergeSha: MERGED, mergedBranch: expect.stringContaining('nightly-fix-merged/') as string });
    expect(calls.some((c) => c.startsWith(`git branch nightly-fix-merged/`) && c.endsWith(` ${MERGED}`))).toBe(true);
  });
  it('a visual change is never integrated into local main: main is unmoved, no push, M kept on its own branch', () => {
    go({ mergedNames: 'tests/e2e/menu.spec.ts-snapshots/a.png\0' });
    expect(pushes()).toEqual([]);
    expect(calls.some((c) => c.includes('merge --ff-only') || (c.includes('merge --no-ff') && c.includes('--no-edit')))).toBe(false);
    expect(status()).toMatchObject({ integrated: false, pushed: false, mergeSha: MERGED, mergedBranch: expect.stringContaining('nightly-fix-merged/') as string });
    expect(status().blockers.join(' ')).toContain('visual change');
    expect(calls.some((c) => c.startsWith('git branch nightly-fix-merged/') && c.endsWith(` ${MERGED}`))).toBe(true);
  });
  it('a push that finds M already on origin is recorded as landed', () => {
    const d = deps();
    writeRed();
    const run: FixDeps['run'] = (cmd, args, cwd, env) => {
      if (cmd === 'git' && args[0] === 'merge-base' && args[2] === MERGED && args[3] === 'refs/remotes/origin/main') return { code: 0, stdout: '', stderr: '' };
      return d.run(cmd, args, cwd, env);
    };
    expect(fix({ ...d, run }, false)).toBe(0);
    expect(pushes()).toEqual([]);
    expect(status().pushedSha).toBe(MERGED);
    const st = JSON.parse(readFileSync(join(dir, 'gate', 'nightly-fix-status.json'), 'utf8')) as FixStatus;
    expect(morningReport({ status: readStatus(join(dir, 'gate')), fix: st, push: undefined, nowMs: NOON().getTime() })[0]).toBe(`PUSHED ${MERGED.slice(0, 7)} to origin/main`);
  });
  it('the merge worktree must still be at M and clean before M is integrated', () => {
    const d = deps();
    writeRed();
    const run: FixDeps['run'] = (cmd, args, cwd, env) => {
      if (cmd === 'git' && args[0] === 'status' && cwd.includes('nightly-fix-merge')) return { code: 0, stdout: '?? junk.txt\n', stderr: '' };
      return d.run(cmd, args, cwd, env);
    };
    expect(fix({ ...d, run }, false)).toBe(0);
    expect(pushes()).toEqual([]);
    expect(calls.some((c) => c.includes('merge --ff-only'))).toBe(false);
    expect(status().blockers.join(' ')).toContain('merge worktree changed');
  });
  it('pnpm install in both worktrees carries a timeout', () => {
    writeRed();
    const d = deps();
    const timeouts: (number | undefined)[] = [];
    const run: FixDeps['run'] = (cmd, args, cwd, env, t) => {
      if (cmd === 'corepack' && args[1] === 'install') timeouts.push(t);
      return d.run(cmd, args, cwd, env, t);
    };
    fix({ ...d, run }, false);
    expect(timeouts.length).toBeGreaterThanOrEqual(2);
    expect(timeouts.every((t) => typeof t === 'number' && t > 0)).toBe(true);
  });
  it('F is never deleted when the kept branch could not be created or sits at another sha', () => {
    for (const mode of ['missing', 'other']) {
      calls = [];
      writeRed();
      const d = deps({ gate: 1 });
      const run: FixDeps['run'] = (cmd, args, cwd, env, t) => {
        if (cmd === 'git' && args[0] === 'branch' && args[1]?.startsWith('nightly-fix-kept/')) {
          calls.push(`git ${args.join(' ')}`);
          return mode === 'missing' ? { code: 128, stdout: '', stderr: 'no' } : { code: 0, stdout: '', stderr: '' };
        }
        if (cmd === 'git' && args[0] === 'rev-parse' && args.some((a) => a.startsWith('refs/heads/nightly-fix-kept/'))) return mode === 'missing' ? { code: 1, stdout: '', stderr: '' } : { code: 0, stdout: `${MOVED}\n`, stderr: '' };
        return d.run(cmd, args, cwd, env, t);
      };
      rmSync(join(dir, 'gate', 'nightly-fix-status.json'), { force: true });
      fix({ ...d, run }, false);
      expect(kept(), mode).toBe(true);
      expect(calls.some((c) => c.startsWith('git branch -D nightly-fix/2026-11-20')), mode).toBe(false);
    }
  });
  it('an exception with an unreadable rev-list count keeps the branch (never deleted blind)', () => {
    writeRed();
    const d = deps();
    let thrown = false;
    const run: FixDeps['run'] = (cmd, args, cwd, env, t) => {
      if (cmd === 'corepack' && args.join(' ').includes('gate:commit')) {
        thrown = true;
        throw new Error('boom');
      }
      if (thrown && cmd === 'git' && args[0] === 'rev-list') return { code: 128, stdout: '', stderr: 'bad' };
      return d.run(cmd, args, cwd, env, t);
    };
    expect(fix({ ...d, run }, false)).toBe(1);
    expect(kept()).toBe(true);
  });
  it('an existing kept branch is never overwritten', () => {
    go({ gate: 1, keptExists: true });
    expect(calls).toContain('git branch nightly-fix-kept/2026-11-20-2 nightly-fix/2026-11-20');
    expect(calls.some((c) => c === 'git branch nightly-fix-kept/2026-11-20 nightly-fix/2026-11-20')).toBe(false);
  });
  it('the merge worktree is removed on a non-push return, and no per-round merge branch is created', () => {
    go({ gate: 1 });
    expect(calls.some((c) => c.startsWith('git worktree remove --force') && c.includes('nightly-fix-merge'))).toBe(true);
    expect(calls.some((c) => c.includes('-merge') && c.startsWith('git branch'))).toBe(false);
  });
  it('the merge worktree is removed when a step throws, and a branch ahead of origin is kept', () => {
    writeRed();
    const d = deps();
    const run: FixDeps['run'] = (cmd, args, cwd, env) => {
      if (cmd === 'corepack' && args.join(' ').includes('gate:commit')) throw new Error('boom');
      return d.run(cmd, args, cwd, env);
    };
    expect(fix({ ...d, run }, false)).toBe(1);
    expect(calls.some((c) => c.startsWith('git worktree remove --force') && c.includes('nightly-fix-merge'))).toBe(true);
    expect(kept()).toBe(true);
  });
  it('too little time before 07:00 to verify: fixes are kept, no verify run starts, no push', () => {
    go({ clock: new Date(2026, 10, 20, 6, 10, 0) });
    expect(claudeCalls()).toHaveLength(1);
    expect(fullRunCalls()).toEqual([]);
    expect(pushes()).toEqual([]);
    expect(calls.some((c) => c.includes('gate:commit'))).toBe(false);
    expect(status().blockers.join(' ')).toContain('not enough time');
    expect(kept()).toBe(true);
    expect(status().keptBranch).toBe('nightly-fix-kept/2026-11-20');
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
  it('origin moved during the run: M is merged locally but not pushed', () => {
    go({ originMoves: true });
    expect(pushes()).toEqual([]);
    expect(status().blockers.join(' ')).toContain('origin/main');
  });
  it('a forbidden path in the diff: no commit, no re-run, needs-human', () => {
    go({ names: 'src/core/sim/step.ts\0' });
    expect(calls.some((c) => c.startsWith('git commit'))).toBe(false);
    expect(calls.some((c) => c.includes('e2e-route.ts') && !classifies.includes(c))).toBe(false);
    expect(pushes()).toEqual([]);
    expect(status().state).toBe('needs-human');
  });
  it('a diff that adds test.skip: no commit, needs-human', () => {
    go({ diff: '+  test.skip(true, "later");\n' });
    expect(calls.some((c) => c.startsWith('git commit'))).toBe(false);
    expect(status().results[0]?.reason).toContain('skip');
  });
  it('no progress: the same diff twice in a row stops that failure as needs-human after two rounds', () => {
    go({ rerunCode: 1 });
    expect(claudeCalls()).toHaveLength(2);
    expect(status().results[0]).toMatchObject({ outcome: 'needs-human', rounds: 2 });
    expect(status().results[0]?.reason).toContain('no progress');
    expect(pushes()).toEqual([]);
  });
  it('no progress: the same error (read from the re-run JSON, numbers masked) stops it even when the diff changes', () => {
    go({ rerunCode: 1, varyDiff: true, rerunError: 'Error: Timeout 5000ms waiting for #menu' });
    expect(claudeCalls()).toHaveLength(2);
    expect(status().results[0]).toMatchObject({ outcome: 'needs-human' });
  });
  it('no progress: A,B,A oscillation stops at the third round', () => {
    go({ rerunCode: 1, diffs: ['+  a();\n', '+  b();\n'] });
    expect(claudeCalls()).toHaveLength(3);
    expect(status().results[0]).toMatchObject({ outcome: 'needs-human' });
  });
  it('no progress: a whitespace-only or comment-only change counts as the same diff', () => {
    go({ rerunCode: 1, diffs: ['+  a();\n', '+a();\n+// because\n'] });
    expect(claudeCalls()).toHaveLength(2);
    expect(status().results[0]).toMatchObject({ outcome: 'needs-human' });
  });
  it('weak-fix rejection on round 2: a skip added later is needs-human, nothing committed', () => {
    go({ rerunCode: 1, diffs: ['+  a();\n', '+  test.skip(true, "later");\n'] });
    expect(claudeCalls()).toHaveLength(2);
    expect(status().results[0]).toMatchObject({ outcome: 'needs-human' });
    expect(status().results[0]?.reason).toContain('skip');
    expect(calls.some((c) => c.startsWith('git commit'))).toBe(false);
  });
  it('no progress carries across verify rounds: the same error after a red verify stops the failure', () => {
    go({ rerunRedOn: [1, 4], rerunError: 'Error: Timeout 1ms', verifyRed: [1], varyDiff: true });
    // round 1 red (E), round 2 green (fixed), verify 1 red, pass 2 round red with E again -> stuck
    expect(claudeCalls()).toHaveLength(3);
    expect(pushes()).toEqual([]);
  });
  it('red rounds with a new diff and a new error each time stop at the failure share of the spend cap, not at a round count', () => {
    go({ rerunCode: 1, varyDiff: true });
    expect(claudeCalls()).toHaveLength(PER_FAILURE_SPEND_CAP_USD / ROUND_BUDGET_USD);
    expect(status().results[0]).toMatchObject({ outcome: 'unfixed' });
    expect(status().results[0]?.reason).toContain('share of the night spend cap');
    expect(pushes()).toEqual([]);
  });
  it('the night spend cap is shared across failures: 4 stuck failures use 3 shares, the fourth never starts', () => {
    go({ rerunCode: 1, varyDiff: true, failures: 4 });
    expect(claudeCalls()).toHaveLength(NIGHT_SPEND_CAP_USD / ROUND_BUDGET_USD);
    expect(status().results.some((r) => r.reason.includes('night spend cap'))).toBe(true);
  });
  it('the spend cap and the failure share count across verify rounds', () => {
    go({ verifyRed: Array.from({ length: 40 }, (_, i) => i + 1), varyDiff: true });
    expect(claudeCalls()).toHaveLength(PER_FAILURE_SPEND_CAP_USD / ROUND_BUDGET_USD);
    expect(pushes()).toEqual([]);
    expect(kept()).toBe(true);
  });
  const spendFile = (): string => join(dir, 'gate', 'nightly-fix-spend.json');
  const day = (): string => localDay(NOON());
  const capRounds = NIGHT_SPEND_CAP_USD / ROUND_BUDGET_USD;
  it('a second run the same night continues the round count (status dir, keyed by the local date, written via rename)', () => {
    mkdirSync(join(dir, 'gate'), { recursive: true });
    writeFileSync(spendFile(), JSON.stringify({ date: day(), rounds: capRounds - 2 }));
    go({ rerunCode: 1, varyDiff: true });
    expect(claudeCalls()).toHaveLength(2);
    expect(JSON.parse(readFileSync(spendFile(), 'utf8'))).toEqual({ date: day(), rounds: capRounds });
    expect(existsSync(`${spendFile()}.tmp`)).toBe(false);
  });
  it('an earlier spend file of an older date is ignored; a missing file is 0', () => {
    mkdirSync(join(dir, 'gate'), { recursive: true });
    writeFileSync(spendFile(), JSON.stringify({ date: '2000-01-01', rounds: 99 }));
    go({ rerunCode: 1 });
    expect(claudeCalls()).toHaveLength(2);
    expect(readSpent(join(dir, 'nowhere'), day())).toEqual({ rounds: 0 });
  });
  it.each([
    ['a corrupt file', 'not json {'],
    ['a truncated file', '{"date":"2026-11-'],
    ['an empty file', ''],
    ['the wrong shape', '{"rounds":"3"}'],
    ['a future date', JSON.stringify({ date: '2999-01-01', rounds: 0 })],
  ])('%s fails closed: no claude round starts, the reason is reported', (_n, body) => {
    mkdirSync(join(dir, 'gate'), { recursive: true });
    writeFileSync(spendFile(), body);
    go({ rerunCode: 1, varyDiff: true });
    expect(claudeCalls()).toEqual([]);
    expect(pushes()).toEqual([]);
    expect(status().results[0]?.reason).toContain('nightly-fix-spend.json');
    expect(status().results[0]?.reason).toContain('treating the night spend cap as reached');
  });
  it('branch names and the spend key use the local date of the night', () => {
    go({ rerunCode: 1 });
    expect(calls.some((c) => c.includes(`nightly-fix/${day()}`))).toBe(true);
  });
  it('a later needs-human on a failure that already has a fix commit is appended to the report', () => {
    go({ verifyRed: [1], claudeLater: { code: 0, stdout: 'TRIAGE: {"verdict":"needs-human","reason":"needs a human look"}', stderr: '' } });
    expect(claudeCalls()).toHaveLength(2);
    expect(status().results[0]?.reason).toContain('later pass: needs-human');
    expect(pushes()).toEqual([]);
  });
  it('a re-run that times out at 07:00 reports the hard stop, not a router failure', () => {
    go({ clock: new Date(2026, 10, 20, 5, 0, 0), rerunTimeoutMs: 125 * 60_000 });
    expect(status().results[0]?.reason).toContain('hard stop at 07:00');
    expect(status().results[0]?.reason).not.toContain('router exit');
  });
  it('a gate:commit that times out at 07:00 reports the hard stop, not a red gate; nothing pushed', () => {
    go({ clock: new Date(2026, 10, 20, 5, 50, 0), gateTimeoutMs: 80 * 60_000 });
    expect(status().blockers.join(' ')).toContain('hard stop at 07:00');
    expect(pushes()).toEqual([]);
    expect(status().state).not.toBe('fixed-pushed');
  });
  it('a failure re-entering a fix pass that ends flaky keeps its earlier fix as fixed (not orphaned in M); unverified means no push', () => {
    go({ verifyRed: [1], namesLater: '' });
    expect(claudeCalls()).toHaveLength(2);
    expect(pushes()).toEqual([]);
    expect(status().results[0]?.reason).toContain('not verified');
  });
  it('07:00 hard stop (injected clock): a round starts only with a claude round plus a re-run left, and no child timeout ends after 07:00', () => {
    go({ rerunCode: 1, varyDiff: true, clock: new Date(2026, 10, 20, 5, 0, 0), claudeMs: 25 * 60_000 });
    // starts 05:00, 05:25, 05:50, 06:15 (45 min left); 06:40 has only 20 min left: no round
    expect(claudeCalls()).toHaveLength(4);
    expect(status().results[0]).toMatchObject({ outcome: 'unfixed' });
    expect(status().results[0]?.reason).toContain('hard stop');
    expect(pushes()).toEqual([]);
    expect(timeoutEnds.length).toBeGreaterThan(4);
    const stop = new Date(2026, 10, 20, 7, 0, 0).getTime();
    for (const t of timeoutEnds) expect(t).toBeLessThanOrEqual(stop + 1000);
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
    expect(calls.some((c) => c.startsWith('git commit') || (c.includes('e2e-route.ts') && !classifies.includes(c)))).toBe(false);
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
  it('many real reds (9) are no longer a broken night: one classify retry, then fix rounds, P0/P1 first', () => {
    go({ failures: 9 });
    expect(classifies).toHaveLength(1);
    expect(claudeCalls().length).toBeGreaterThan(0);
    expect(status().blockers.join(' ')).not.toContain('broken night');
  });
  it('the classify retry is one router call on the PC with every red spec, never the Mac', () => {
    go();
    expect(classifies).toHaveLength(1);
    expect(classifies[0]).toContain('e2e-route.ts run --pc -- tests/e2e/menu.spec.ts');
    expect(classifies[0]).not.toMatch(/--local|--mac/);
    expect(envs['classify']).toBeUndefined();
  });
  it('router exit 94 on the retry: unclassified, treated as real, no rounds, no push, reason recorded', () => {
    go({ classifyExit: 94 });
    expect(claudeCalls()).toEqual([]);
    expect(pushes()).toEqual([]);
    expect(status().results[0]).toMatchObject({ outcome: 'needs-human' });
    expect(status().results[0]?.reason).toContain('router exit 94');
  });
  it('all reds pass on the retry: flaky-on-retry with a proposed known-red entry, clean-night push of the tested sha', () => {
    go({ failures: 2, classifyPass: ['opens', 'opens 1'] });
    expect(claudeCalls()).toEqual([]);
    expect(status().results.map((r) => r.outcome)).toEqual(['flaky', 'flaky']);
    expect(status().results[0]?.reason).toContain('titleIncludes');
    expect(pushes()).toEqual([`git push origin ${SHA}:main`]); // the clean night pushes the tested sha once, plain
    expect(pushes().some((c) => /--force|\s-f(\s|$)|\+/.test(c))).toBe(false);
  });
  it('builds the fix worktree on the tested sha, not origin/main', () => {
    go();
    expect(calls.some((c) => c.startsWith('git worktree add -B nightly-fix/2026-11-20') && c.endsWith(` ${SHA}`))).toBe(true);
    expect(calls.some((c) => /worktree add .* origin\/main$/.test(c))).toBe(false);
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

  describe('collect-and-fix at 01:00', () => {
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
      expect(lockSeen).toEqual([true, true, true]); // the lock covers the collect wait
      expect(sleeps).toEqual([20 * 60_000, 20 * 60_000]);
      expect(out).toContain('retrying in 20 min');
      expect(claudeCalls()).toHaveLength(1);
      expect(fullRunCalls()).toEqual([]); // the diff stays inside the re-run spec
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

  describe('collect-and-fix exception', () => {
    it('an exception in collect writes a needs-human status with a redacted error and returns 1', () => {
      const d = deps();
      mkdirSync(join(dir, 'gate'), { recursive: true });
      writeFileSync(join(dir, 'gate', 'nightly-status.json'), JSON.stringify(pendingStatus(SHA, 'raw-1', 's')));
      expect(main(['collect-and-fix'], { ...d, run: () => { throw new Error('boom from /Users/bob/x'); } })).toBe(1);
      expect(status().state).toBe('needs-human');
      expect(status().blockers.join(' ')).not.toContain('/Users/bob');
      expect(existsSync(join(dir, 'gate', 'nightly-fix.lock'))).toBe(false);
    });
  });

  describe('09:00 morning report', () => {
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

describe('one-screen morning report (pure render)', () => {
  it('ignores push and fix statuses from another sha (stale files)', () => {
    const S = 'a'.repeat(40);
    const OLD = 'b'.repeat(40);
    const night = finishStatus(pendingStatus(S, 'r', 's'), 1, { passed: 5, failed: [{ file: 'menu.spec.ts', title: 'opens' }], flaky: [] }, [], 'f', 'PC');
    const stalePush: PushStatus = { schema: 1, verdict: 'green', sha: OLD, pushed: true, blockers: [], untestedLocal: 0, finishedAt: 't' };
    const staleFix: FixStatus = { schema: 1, state: 'fixed-pushed', sha: OLD, finishedAt: 't', pushed: true, results: [], blockers: [], pushedSha: OLD };
    const t = morningReport({ status: night, fix: staleFix, push: stalePush, nowMs: Date.now() });
    expect(t[0]).toMatch(/^NOT PUSHED/);
    expect(t.join('\n')).not.toContain('bbbbbbb');
    const same = morningReport({ status: night, fix: { ...staleFix, sha: S, pushedSha: S }, push: undefined, nowMs: Date.now() });
    expect(same[0]).toBe('PUSHED aaaaaaa to origin/main');
  });
  const SHA = 'a'.repeat(40);
  const night = (failed: { file: string; title: string }[]) => finishStatus(pendingStatus(SHA, 'r', 's'), 1, { passed: 5, failed, flaky: [] }, [], 'f', 'PC');
  const fix = (state: FixStatus['state'], pushed: boolean, results: FixStatus['results'], extra: Partial<FixStatus> = {}): FixStatus => ({ schema: 1, state, sha: SHA, finishedAt: '2026-11-25T03:00:00.000Z', pushed, results, blockers: [], ...extra });
  const pushed: PushStatus = { schema: 1, verdict: 'known-red', sha: SHA, pushed: true, blockers: [], untestedLocal: 2, finishedAt: 't' };
  const now = new Date('2026-11-25T08:00:00Z').getTime();

  it('pushed: first line PUSHED, count of untested local commits', () => {
    const t = morningReport({ status: night([]), fix: undefined, push: pushed, nowMs: now });
    expect(t[0]).toBe('PUSHED aaaaaaa to origin/main');
    expect(t.at(-1)).toBe('untested local commits on main: 2');
  });
  it('needs-human: table row with tier, class, rounds, last 3 error lines, the e2e command and the kept branch', () => {
    const f = fix('needs-human', false, [{ file: 'match-end.spec.ts', title: 'ends | cleanly', outcome: 'needs-human', rounds: 3, reason: 'r', tier: 'P0', errorTail: ['e1', 'e2', 'e3'] }], { blockers: ['3 rounds failed'], keptBranch: 'nightly-fix-kept/2026-11-25' });
    const t = morningReport({ status: night([{ file: 'match-end.spec.ts', title: 'x' }]), fix: f, push: undefined, nowMs: now });
    expect(t[0]).toBe('NOT PUSHED: 3 rounds failed');
    expect(t).toContain('| tests/e2e/match-end.spec.ts | ends / cleanly | P0 | real | 3 | needs-human | e1 / e2 / e3 |');
    expect(t).toContain('  - ends / cleanly'.replace('/', '|') + ': corepack pnpm e2e -- tests/e2e/match-end.spec.ts');
    expect(t.join('\n')).toContain('branch nightly-fix-kept/2026-11-25');
  });
  it('gate red: reason is first line and the gate tail is shown', () => {
    const p: PushStatus = { ...pushed, pushed: false, blockers: ['gate:commit failed on the tested commit'], gateTail: ['FAIL a.test.ts', 'boom'] };
    const t = morningReport({ status: night([]), fix: undefined, push: p, nowMs: now });
    expect(t[0]).toBe('NOT PUSHED: gate:commit failed on the tested commit');
    expect(t).toContain('  | FAIL a.test.ts');
  });
  it('all flaky/P2: proposes known-red JSON, nothing to rerun, no host leaks', () => {
    const f = fix('fixed-pushed', true, [
      { file: 'a.spec.ts', title: 'flaky one', outcome: 'flaky', rounds: 0, reason: 'passed on retry', tier: 'P1' },
      { file: 'b.spec.ts', title: 'p2 one', outcome: 'p2-record', rounds: 0, reason: 'ssh://user@10.0.0.5/x', tier: 'P2', errorTail: ['at ssh://user@10.0.0.5/x'] },
    ]);
    const t = morningReport({ status: night([]), fix: f, push: undefined, nowMs: now });
    const text = t.join('\n');
    expect(t[0]).toBe('PUSHED aaaaaaa to origin/main');
    expect(text).toContain('flaky-on-retry');
    expect(text).toContain('"file":"tests/e2e/a.spec.ts","titleIncludes":"flaky one","tier":"P1","firstSeen":"2026-11-25"');
    expect(text).not.toContain('corepack pnpm e2e --');
    expect(text).not.toContain('10.0.0.5');
  });
});

describe('WP3a verify and landing logic (pure)', () => {
  const at = (h: number, m = 0): Date => new Date(2026, 10, 25, h, m, 0, 0);
  const pass = (t: { file: string; title: string }): { suites: unknown[] } => ({ suites: [{ file: t.file, specs: [{ title: t.title, tests: [{ status: 'expected', results: [{ status: 'passed' }] }] }] }] });
  const fail = (t: { file: string; title: string }): { suites: unknown[] } => ({ suites: [{ file: t.file, specs: [{ title: t.title, tests: [{ status: 'unexpected', results: [{ status: 'failed' }] }] }] }] });
  const join2 = (...p: { suites: unknown[] }[]): unknown => ({ suites: p.flatMap((x) => x.suites) });
  const a = { file: 'a.spec.ts', title: 'a' };
  const b = { file: 'b.spec.ts', title: 'b' };

  it('constants: 5 min land margin, gate estimate 15 min', () => {
    expect(LAND_MARGIN_MS).toBe(5 * 60_000);
    expect(GATE_ESTIMATE_MS).toBe(15 * 60_000);
  });
  it('canStartVerify needs rerun + gate + margin (60 min) before the 07:00 stop', () => {
    expect(canStartVerify(at(1).getTime(), at(5, 59))).toBe(true);
    expect(canStartVerify(at(1).getTime(), at(6, 1))).toBe(false);
  });
  it('verifyVerdict: all todo green and no new red', () => {
    const v = verifyVerdict({ child: { code: 0 }, json: join2(pass(a), pass(b)), todo: [a, b], baseline: [a, b], known: [] });
    expect(v).toMatchObject({ ran: true, green: true, greenCount: 2, newReds: [] });
  });
  it('verifyVerdict: exit 0 with a todo not passed is not green; a red outside the baseline is new', () => {
    const c = { file: 'c.spec.ts', title: 'c' };
    const v = verifyVerdict({ child: { code: 1 }, json: join2(pass(a), fail(b), fail(c)), todo: [a, b], baseline: [a, b], known: [] });
    expect(v.green).toBe(false);
    expect(v.greenCount).toBe(1);
    expect(v.newReds).toEqual([c]);
    expect(verifyVerdict({ child: { code: 0 }, json: { suites: [] }, todo: [a], baseline: [a], known: [] }).green).toBe(false);
  });
  it('verifyVerdict: router stop, signal, timeout, or no JSON is not ran', () => {
    for (const child of [{ code: 95 }, { code: 0, signal: 'SIGTERM' }, { code: 1, timedOut: true }, { code: 2 }]) expect(verifyVerdict({ child, json: pass(a), todo: [a], baseline: [], known: [] }).ran).toBe(false);
    expect(verifyVerdict({ child: { code: 0 }, json: undefined, todo: [a], baseline: [], known: [] }).ran).toBe(false);
  });
  it('needsFullRun: only when the diff leaves the re-run spec files', () => {
    expect(needsFullRun(['tests/e2e/a.spec.ts'], ['a.spec.ts'])).toBe(false);
    expect(needsFullRun(['tests/e2e/a.spec.ts', 'src/game/x.ts'], ['tests/e2e/a.spec.ts'])).toBe(true);
    expect(needsFullRun(['tests/e2e/other.spec.ts'], ['a.spec.ts'])).toBe(true);
    expect(needsFullRun([], ['a.spec.ts'])).toBe(false);
  });
  it('integrationRefusals: empty when all is well, one reason per violated condition', () => {
    const ok = { msLeft: 3600_000, mainCheckedOutHere: true, headIsMain: true, trackedClean: true, operationsInProgress: [], testedIsAncestor: true, mergeTreeClean: true, markersClean: true, forbidden: [] };
    expect(integrationRefusals(ok)).toEqual([]);
    expect(integrationRefusals({ ...ok, mergeTreeClean: undefined, markersClean: undefined })).toEqual([]);
    expect(integrationRefusals({ ...ok, msLeft: 1000 })).toHaveLength(1);
    expect(integrationRefusals({ ...ok, trackedClean: false, headIsMain: false })).toHaveLength(2);
    expect(integrationRefusals({ ...ok, operationsInProgress: ['MERGE_HEAD'] })[0]).toContain('MERGE_HEAD');
    expect(integrationRefusals({ ...ok, testedIsAncestor: false, mergeTreeClean: false, markersClean: false, mainCheckedOutHere: false })).toHaveLength(4);
    expect(integrationRefusals({ ...ok, forbidden: ['tools/x.ts'] })[0]).toContain('tools/x.ts');
  });
  it('landBlockers: empty when every condition holds, each failing one blocks', () => {
    const ok: LandInput = { shaIsHex: true, noEnvOverride: true, beforeDeadline: true, sameSpecsGreen: true, gateCommitOk: true, collateralOk: true, mergeOk: true, integrated: true, originIsAncestor: true, hasCommits: true };
    expect(landBlockers(ok)).toEqual([]);
    for (const k of Object.keys(ok) as (keyof LandInput)[]) expect(landBlockers({ ...ok, [k]: false }), k).toHaveLength(1);
    expect(landBlockers({ ...ok, originIsAncestor: false })[0]).toContain('never forced');
  });
  it('mergedBranchName: base, then -2 .. -19, then undefined', () => {
    expect(mergedBranchName('2026-11-25', () => false)).toBe('nightly-fix-merged/2026-11-25');
    const taken = new Set(['nightly-fix-merged/2026-11-25', 'nightly-fix-merged/2026-11-25-2']);
    expect(mergedBranchName('2026-11-25', (n) => taken.has(n))).toBe('nightly-fix-merged/2026-11-25-3');
    expect(mergedBranchName('2026-11-25', () => true)).toBeUndefined();
  });
  it('morningReport headline prefers pushedSha over sha', () => {
    const f: FixStatus = { schema: 1, state: 'fixed-pushed', sha: 'a'.repeat(40), finishedAt: '2026-11-25T03:00:00.000Z', pushed: true, results: [], blockers: [], pushedSha: 'b'.repeat(40), mergeSha: 'b'.repeat(40) };
    expect(morningReport({ status: undefined, fix: f, push: undefined, nowMs: 0 })[0]).toBe('PUSHED bbbbbbb to origin/main');
    const noPushed: FixStatus = { schema: 1, state: 'fixed-pushed', sha: f.sha, finishedAt: f.finishedAt, pushed: true, results: [], blockers: [] };
    expect(morningReport({ status: undefined, fix: noPushed, push: undefined, nowMs: 0 })[0]).toBe('PUSHED aaaaaaa to origin/main');
  });
});
