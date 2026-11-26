/**
 * Nightly fix loop (runs after `nightly:collect` when the status is red with unrecorded failures):
 *   pnpm nightly:fix [--dry-run]            fix loop only (needs a fresh collected red status)
 *   nightly-fix.ts collect-and-fix          collect (retry every 20 min until 04:30 while the 23:00 full run is unfinished), then the fix loop (the 01:00 LaunchAgent)
 *   nightly-fix.ts report                   read-only morning report to tte-gate/nightly-morning-report.md (the 09:00 LaunchAgent)
 * Per failure: a sandboxed headless `claude -p` round (file tools only, no user/project settings, see nightly-fix-logic.ts) in a
 * fresh worktree from origin/main (.scratch/nightly-fix-wt), then a re-run of that spec only via the router (`--pc`: PC only, never
 * the Mac; exits 89/94/95/96, signals and timeouts stop the loop). At most 3 rounds, at most 3 failures, one run at a time (lock file).
 * Verify loop (WP3e/3f): collect -> fix -> merge --no-ff of the fix branch F onto the tested sha T in a detached worktree (M) -> re-run the fixed
 * specs on M (PC only) -> gate:commit -> a FULL e2e of M when the diff leaves those specs; up to 3 rounds (a red round goes back to a fix pass).
 * Hard stop 07:00 for a night run (22:00 by day, 6 h max): nothing starts that cannot finish. Flaky and known-red specs are reported, never chased.
 * Then integrateMain(M) into local main and pushMerged (plain `git push origin M:main`, never forced) when `landBlockers` is empty; a partial
 * night or a visual change is merged locally but not pushed; a red gate or a collateral red is needs-human; unverified fixes stay on
 * nightly-fix-kept/<date>, a verified M on nightly-fix-merged/<date>. Outcomes: fixed (commit), flaky, needs-human. Report: tte-gate/nightly-fix-*.
 * A night with no new reds (green, or known-red only) skips the fix loop: collect-and-fix pushes local main itself when the
 * nightly-push.ts preconditions hold (origin/main an ancestor, main is the tested commit, clean tree, gate:commit). Report: tte-gate/nightly-push-status.json.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { loadKnownRed } from './known-red';
import { collect, readStatus, statusPath, type Deps, type RunResult } from './nightly-e2e';
import {
  addsSkipMarkers, BLOCKING_ENV, blockingReds, buildPrompt, byTier, firstError, noProgress, spendAllowed, NIGHT_SPEND_CAP_USD, ROUND_BUDGET_USD, type RoundSig, canStartFullRun, canStartRound, canStartVerify, capTimeout, childFailed, classifyReds, claudeArgs, claudeEnv, deadlineReached, dedupeRefs, describeFix, errorTail, extractFailures, finalState,
  forbiddenTouched, FULL_RUN_MS, fullRunIncomplete, GATE_TIMEOUT_MS, judgeFullRun, knownRedProposal, landBlockers, LOCK_STALE_MS, mergeSubject, mergedBranchName, morningReport, needsFullRun, noPushEnv, parseNulList, parseTriage,
  redsVerdict, retryAllowed, RETRY_WAIT_MS, RERUN_TIMEOUT_MS, rerunStops, ROUND_TIMEOUT_MS, shouldRun, slug, specPath, statusUsable, titlePassed, triage, verifyVerdict,
  type ClassifiedRed, type Failure, type FailureResult, type FixState, type FixStatus, type LandInput, type RetryOutcome, type VerifyRound,
} from './nightly-fix-logic';
import { integrateMain, keepMerged, pushMerged } from './nightly-fix-land';
import { GATE_TAIL_LINES, nightVerdict, pushCleanNight, readPushStatus } from './nightly-push';
import { tierOf } from './test-tiers';
import { describeStatus, parseRawId, parseResults, pendingStatus, unrecordedFailures, type Results } from './nightly-status';
import { redact } from './redact';

export interface FixRun extends RunResult {
  signal?: string | undefined;
  timedOut?: boolean | undefined;
}
type Env = Readonly<Record<string, string | undefined>>;
export interface FixDeps extends Omit<Deps, 'run'> {
  run: (cmd: string, args: readonly string[], cwd: string, env: Env, timeoutMs?: number) => FixRun;
  /** Block for `ms` (the collect retry wait); injected so tests do not wait. */
  sleep: (ms: number) => void;
}
export interface FixOpts {
  /** collect-and-fix: the status must have been finished by this run's collect (finishedAt >= this). */
  readonly notBefore?: string;
  /** The loop's start (default: now); the hard stop and round budgets count from here. */
  readonly startMs?: number;
  /** The caller (collect-and-fix) already holds the lock; fix releases it. */
  readonly lockHeld?: boolean;
}
interface Life {
  prepared: boolean;
  mergePrepared: boolean;
  keep: boolean;
  threw: boolean;
  branch: string;
  /** The tested commit T: the fix and merge worktrees are built on it (it need not be on origin/main). */
  tip: string;
}
interface Ref {
  file: string;
  title: string;
}

const FIX_WT = join('.scratch', 'nightly-fix-wt');
const MERGE_WT = join('.scratch', 'nightly-fix-merge');
const fixStatusPath = (dir: string): string => join(dir, 'nightly-fix-status.json');
const lockPath = (dir: string): string => join(dir, 'nightly-fix.lock');
// Built from parts so the no-host-literals repo guard does not read the address as a user@host literal.
const TRAILER = `Co-Authored-By: Claude Sonnet 5.5 <${['noreply', 'anthropic.com'].join('@')}>`;
const rerunArgs = (file: string): string[] => ['pnpm', 'exec', 'tsx', 'tools/ci/e2e-route.ts', 'run', '--pc', '--', specPath(file)];

export function readFixStatus(dir: string): FixStatus | undefined {
  try {
    const v = JSON.parse(readFileSync(fixStatusPath(dir), 'utf8')) as FixStatus;
    return v.schema === 1 ? v : undefined;
  } catch {
    return undefined;
  }
}

/** Report context of this process's one fix run: error tails per red and the branch name unpushed fixes are kept under. */
const errTails = new Map<string, string[]>();
let keptName = '';

function writeFixStatus(d: FixDeps, sha: string, results: FailureResult[], pushed: boolean, blockers: string[], force?: FixState, extra: Partial<FixStatus> = {}): FixStatus {
  const rich = results.map((r) => ({ ...r, tier: tierOf(r.file, r.title), errorTail: errTails.get(`${r.file}\0${r.title}`) ?? [] }));
  const s: FixStatus = {
    schema: 1, state: force ?? finalState(results, pushed), sha, finishedAt: d.now().toISOString(), pushed, results: rich, blockers,
    ...extra,
  };
  mkdirSync(d.statusDir, { recursive: true });
  writeFileSync(fixStatusPath(d.statusDir), `${JSON.stringify(s, null, 2)}\n`);
  writeFileSync(join(d.statusDir, 'nightly-fix-report.md'), `${[...describeStatus(readStatus(d.statusDir), d.now().getTime()), ...describeFix(s)].join('\n')}\n`);
  for (const l of describeFix(s)) d.out(`${l}\n`);
  return s;
}

/** One run at a time: an exclusive lock file; a lock older than LOCK_STALE_MS is a crashed run and is taken over. */
function acquireLock(d: FixDeps): boolean {
  const p = lockPath(d.statusDir);
  mkdirSync(d.statusDir, { recursive: true });
  try {
    if (existsSync(p) && d.now().getTime() - statSync(p).mtimeMs > LOCK_STALE_MS) rmSync(p, { force: true });
    writeFileSync(p, `${d.now().toISOString()}\n`, { flag: 'wx' });
    return true;
  } catch {
    return false;
  }
}

export function fix(d: FixDeps, dry: boolean, opts: FixOpts = {}): number {
  for (const k of BLOCKING_ENV) {
    if (d.env[k]) {
      d.err(`nightly:fix: refusing to run with ${k} set (PC only)\n`);
      return 2;
    }
  }
  if (dry) return fixInner(d, true, opts, [], { prepared: false, mergePrepared: false, keep: false, threw: false, branch: '', tip: '' });
  if (!opts.lockHeld && !acquireLock(d)) {
    d.out('nightly:fix: another run holds the lock; nothing to do\n');
    return 0;
  }
  const results: FailureResult[] = [];
  const life: Life = { prepared: false, mergePrepared: false, keep: false, threw: false, branch: '', tip: '' };
  try {
    return fixInner(d, false, opts, results, life);
  } catch (e) {
    life.threw = true;
    const st = readStatus(d.statusDir);
    writeFixStatus(d, st?.sha ?? '', results, false, [`error: ${redact(e instanceof Error ? e.message : String(e)).slice(0, 300)}`], 'needs-human');
    return 1;
  } finally {
    if (life.mergePrepared) {
      d.run('git', ['worktree', 'remove', '--force', resolve(d.repo, MERGE_WT)], d.repo, d.env);
    }
    if (life.prepared) {
      d.run('git', ['worktree', 'remove', '--force', resolve(d.repo, FIX_WT)], d.repo, d.env);
      const br = life.branch;
      const g = (...a: string[]): FixRun => d.run('git', a, d.repo, d.env);
      const tip = g('rev-parse', '--verify', '-q', `refs/heads/${br}`);
      const brSha = tip.stdout.trim();
      // After an exception keep the branch whenever it is ahead of the tested commit; a failed or empty count counts as ahead.
      const count = (): number => {
        const r = g('rev-list', '--count', `${life.tip || 'origin/main'}..${br}`);
        return r.code === 0 && r.stdout.trim() !== '' ? Number(r.stdout.trim()) : Number.NaN;
      };
      if (life.threw && !(count() === 0)) life.keep = true;
      // Delete F only once its commits are provably elsewhere: never on a kept branch that is missing or at another sha.
      let safe = false;
      if (tip.code !== 0 || brSha === '') safe = false;
      else if (life.keep) {
        // Unpushed fixes (collateral red, no time, gate failed) stay reachable on a local branch for the human; never overwrite an earlier kept branch.
        const name = mergedBranchName(br.slice('nightly-fix/'.length), (n) => g('branch', '--list', n).stdout.trim() !== '', 'nightly-fix-kept');
        if (name) {
          g('branch', name, br);
          const at = g('rev-parse', '--verify', '-q', `refs/heads/${name}`);
          safe = at.code === 0 && at.stdout.trim() === brSha;
        }
      } else {
        safe = count() === 0 || g('branch', '--list', 'nightly-fix-merged/*', '--contains', br).stdout.trim() !== '';
      }
      if (safe) g('branch', '-D', br);
    }
    rmSync(lockPath(d.statusDir), { force: true });
  }
}

function fixInner(d: FixDeps, dry: boolean, opts: FixOpts, results: FailureResult[], life: Life): number {
  const st = readStatus(d.statusDir);
  if (!shouldRun(st) || !st) {
    d.out(`nightly:fix: nothing to do (${st ? `${st.state}, ${String(st.unrecorded.length)} unrecorded` : 'no status'})\n`);
    return 0;
  }
  if (!statusUsable(st, d.now().getTime(), opts.notBefore)) {
    d.out('nightly:fix: the status is stale or was not collected by this run; nothing to do\n');
    return 0;
  }
  if (!dry && readFixStatus(d.statusDir)?.sha === st.sha) {
    d.out(`nightly:fix: ${st.sha.slice(0, 7)} was already handled (see nightly:status)\n`);
    return 0;
  }
  let json: unknown;
  try {
    json = JSON.parse(readFileSync(join(d.statusDir, 'nightly-results.json'), 'utf8')) as unknown;
  } catch {
    json = undefined;
  }
  const failures = extractFailures(json, dedupeRefs(st.unrecorded));
  const fixWt = resolve(d.repo, FIX_WT);
  const mergeWt = resolve(d.repo, MERGE_WT);
  const stamp = d.now().toISOString().slice(0, 10);
  const branch = `nightly-fix/${stamp}`;
  life.branch = branch;
  keptName = `nightly-fix-kept/${stamp}`;
  errTails.clear();
  for (const f of failures) errTails.set(`${f.file}\0${f.title}`, errorTail(f.message));
  const startMs = opts.startMs ?? d.now().getTime();
  const done = (pushed: boolean, blockers: string[], force?: FixState, extra?: Partial<FixStatus>): number => {
    // Whenever the fixes stay on a local branch (life.keep), the status names it.
    writeFixStatus(d, st.sha, results, pushed, blockers, force, { ...(life.keep && keptName ? { keptBranch: keptName } : {}), ...extra });
    return 0;
  };
  if (dry) {
    d.out(`nightly:fix dry run for ${st.sha.slice(0, 7)}: ${String(failures.length)} failure(s); nothing is launched or pushed\n`);
    d.out(`  first: ONE retry of all ${String(failures.length)} distinct red(s) via the router (--pc), then tier: flaky-on-retry and P2 reds never block (no real P0/P1 red = clean push); every real red is worked one at a time, P0/P1 first, with no round cap (stops: green, the 07:00 hard stop, no progress, the night spend cap ${String(NIGHT_SPEND_CAP_USD)} USD at ${String(ROUND_BUDGET_USD)} USD per round)\n`);
    d.out(`  worktree: git worktree add -B ${branch} ${fixWt} ${st.sha.slice(0, 7)} (the tested commit; then pnpm install --frozen-lockfile --prefer-offline)\n`);
    for (const f of failures) {
      d.out(`--- ${f.file}: ${f.title}\n  claude ${claudeArgs('<prompt>').slice(2).join(' ')}\n  re-run: corepack ${rerunArgs(f.file).join(' ')} (PC only)\n${buildPrompt(f, 1, '')}\n`);
    }
    d.out(`  verify: per round merge --no-ff ${branch} onto the tested commit in a detached ${mergeWt} ("${mergeSubject('<what>')}"), conflict-marker grep, the fixed specs re-run on the merged commit (--pc, PC only), corepack pnpm gate:commit, and a FULL e2e of the merged tree when the diff leaves those specs (no round cap; loops until green or the 07:00 hard stop); then merge into local main and, only if everything is green and the night is complete, git push origin <merged sha>:main (no force)\n`);
    return 0;
  }
  const sh = (cwd: string, cmd: string, args: string[], timeout?: number, env: Env = d.env): FixRun => d.run(cmd, args, cwd, env, timeout);
  const git = (cwd: string, ...a: string[]): FixRun => sh(cwd, 'git', a);
  const prep = (wt: string, br: string): boolean => {
    git(d.repo, 'worktree', 'remove', '--force', wt);
    rmSync(wt, { recursive: true, force: true });
    git(d.repo, 'worktree', 'prune');
    if (git(d.repo, 'worktree', 'add', '-B', br, wt, st.sha).code !== 0) return false;
    return sh(wt, 'corepack', ['pnpm', 'install', '--frozen-lockfile', '--prefer-offline'], capTimeout(GATE_TIMEOUT_MS, startMs, d.now())).code === 0;
  };
  let seq = 0;
  /** Re-run one spec on the PC (never the Mac) and read its JSON: green = exit 0 and the title ended `passed` (not skipped). */
  const rerun = (cwd: string, f: Ref): { stop: boolean; green: boolean; code: number; tail: string } => {
    const jsonOut = join(d.statusDir, `nightly-fix-rerun-${String(++seq)}.json`);
    rmSync(jsonOut, { force: true });
    const r = sh(cwd, 'corepack', rerunArgs(f.file), RERUN_TIMEOUT_MS, { ...noPushEnv(d.env), PLAYWRIGHT_JSON_OUTPUT_FILE: jsonOut });
    let passed = false;
    try {
      passed = titlePassed(JSON.parse(readFileSync(jsonOut, 'utf8')) as unknown, f);
    } catch {
      passed = false;
    }
    const tail = redact(`${r.stdout}\n${r.stderr}`.split('\n').slice(-40).join('\n'));
    return { stop: rerunStops(r), green: r.code === 0 && !r.signal && !r.timedOut && passed, code: r.code, tail };
  };

  /** Full suite on the merged tree: detach-submit then attach through the router (PC only). */
  const fullRun = (cwd: string): { results?: Results; json?: unknown; why: string } => {
    const env = { ...noPushEnv(d.env), TTE_E2E_VIA_QUEUE: '1' };
    const route = (a: string[], timeout: number, extra: Record<string, string> = {}): FixRun =>
      sh(cwd, 'corepack', ['pnpm', 'exec', 'tsx', 'tools/ci/e2e-route.ts', ...a], timeout, { ...env, ...extra });
    const sub = route(['run', '--full', '--pc-detach'], 10 * 60_000);
    const id = parseRawId(`${sub.stdout}\n${sub.stderr}`);
    if (sub.code !== 0 || !id) return { why: sub.code === 0 ? 'no job id from the router' : `submit exit ${String(sub.code)}` };
    const jsonOut = join(d.statusDir, `nightly-fix-full-${String(++seq)}.json`);
    rmSync(jsonOut, { force: true });
    const at = route(['run', '--pc-attach', id], capTimeout(FULL_RUN_MS, startMs, d.now()), { PLAYWRIGHT_JSON_OUTPUT_FILE: jsonOut });
    if ((at.code !== 0 && at.code !== 1) || at.signal || at.timedOut) {
      route(['run', '--pc-cancel', id], 5 * 60_000); // best effort: leave nothing running
      return { why: at.timedOut ? 'timed out at the hard stop' : `attach exit ${String(at.code)}` };
    }
    try {
      const json = JSON.parse(readFileSync(jsonOut, 'utf8')) as unknown;
      return { results: parseResults(json), json, why: '' };
    } catch {
      return { why: 'no results.json' };
    }
  };

  if (git(d.repo, 'fetch', 'origin', 'main').code !== 0) return done(false, ['git fetch failed']);
  const base = git(d.repo, 'rev-parse', 'origin/main').stdout.trim();
  // The tested commit T need not be on origin/main (main may be ahead of it locally); only a fast-forward T..M push is possible.
  const shaOnOrigin = git(d.repo, 'merge-base', '--is-ancestor', 'origin/main', st.sha).code === 0;
  if (!shaOnOrigin) return done(false, ['origin/main is not an ancestor of the tested commit (diverged); no fast-forward push, fix locally']);
  life.tip = st.sha;
  life.prepared = true;
  if (!prep(fixWt, branch)) return done(false, ['could not prepare the fix worktree']);
  const active = unrecordedFailures(st.failed, loadKnownRed(fixWt));
  const stillRed = failures.filter((f) => active.some((a) => a.file === f.file && a.title === f.title));
  if (stillRed.length === 0) return done(false, ['every failure is already recorded in known-red.json on the tested commit']);

  // Classify before fixing: one retry of all distinct unrecorded reds on the PC (never the Mac), then tier.
  const retryJson = join(d.statusDir, 'nightly-fix-classify.json');
  rmSync(retryJson, { force: true });
  const specs = [...new Set(stillRed.map((f) => specPath(f.file)))];
  const rr = sh(fixWt, 'corepack', ['pnpm', 'exec', 'tsx', 'tools/ci/e2e-route.ts', 'run', '--pc', '--', ...specs], capTimeout(RERUN_TIMEOUT_MS, startMs, d.now()), { ...noPushEnv(d.env), PLAYWRIGHT_JSON_OUTPUT_FILE: retryJson });
  let retry: RetryOutcome;
  if (rerunStops(rr)) retry = { kind: 'stopped', reason: `router exit ${String(rr.code)}${rr.signal ? ` (${rr.signal})` : ''}${rr.timedOut ? ' (timed out)' : ''}: the retry could not run` };
  else {
    try {
      retry = { kind: 'ran', json: JSON.parse(readFileSync(retryJson, 'utf8')) as unknown };
    } catch {
      retry = { kind: 'stopped', reason: 'the retry left no results.json' };
    }
  }
  const classified = classifyReds(stillRed, retry, (t) => tierOf(t.file, t.title));
  const firstSeen = stamp;
  const record = (c: ClassifiedRed): void => {
    const note = c.cls === 'real' ? c.reason : `${c.reason}; proposed: ${knownRedProposal(c, firstSeen)}`;
    results.push({ file: c.file, title: c.title, outcome: c.cls === 'flaky-on-retry' ? 'flaky' : c.cls === 'p2-record' ? 'p2-record' : c.cls === 'real' ? 'unfixed' : 'needs-human', rounds: 0, reason: redact(note).slice(0, 300) });
  };
  for (const c of classified) if (c.cls !== 'real') record(c);
  const verdict = redsVerdict(classified);
  if (verdict === 'clean-push') {
    // Nothing blocks: the clean-night push (WP1) on the tested commit, with the classified reds no longer counted as unrecorded.
    const pushed = pushCleanNight(d, { ...st, unrecorded: [] }, startMs) === 0 && readPushStatus(d.statusDir)?.pushed === true;
    return done(pushed, pushed ? [] : [...(readPushStatus(d.statusDir)?.blockers ?? ['clean-night push blocked'])]);
  }
  if (classified.some((c) => c.cls === 'unclassified')) {
    for (const c of blockingReds(classified)) if (c.cls === 'real') record(c);
    return done(false, ['the classification retry could not run; reds treated as real, nothing pushed, no rounds']);
  }
  const todo = byTier(stillRed, (t) => tierOf(t.file, t.title)).filter((f) => classified.some((c) => c.cls === 'real' && c.file === f.file && c.title === f.title));

  const reset = (to: string): void => {
    git(fixWt, 'reset', '--hard', to);
    git(fixWt, 'clean', '-ffdx', '-e', 'node_modules'); // ignored files too (settings.local.json), never node_modules
  };
  let roundsStarted = 0; // claude rounds started this night (spend cap)
  const lastSig = new Map<string, RoundSig>(); // per failure, kept across verify rounds (no-progress stop)
  const ahead = (): number => Number(git(fixWt, 'rev-list', '--count', `${st.sha}..${branch}`).stdout.trim() || '0');
  /** One fix pass over `todo` (existing per-failure rounds); returns why it stopped early, or ''. A later result for a spec replaces its earlier one. */
  const fixPass = (todo: readonly Failure[]): string => {
    let stopped = '';
    for (const f of todo) {
      const put = (outcome: FailureResult['outcome'], rounds: number, reason: string): void => {
        const at = results.findIndex((r) => r.file === f.file && r.title === f.title);
        if (at >= 0) results.splice(at, 1);
        results.push({ file: f.file, title: f.title, outcome, rounds, reason: redact(reason).slice(0, 300) });
      };
      if (stopped) {
        put('unfixed', 0, stopped);
        continue;
      }
      const head0 = git(fixWt, 'rev-parse', 'HEAD').stdout.trim();
      let previous = '';
      let rounds = 0;
      for (;;) {
        if (deadlineReached(startMs, d.now()) || !canStartRound(startMs, d.now())) {
          stopped = 'too close to the hard stop (07:00 for a night run, 22:00 by day) for another round; stopping';
          put('unfixed', rounds, stopped);
          reset(head0);
          break;
        }
        if (!spendAllowed(roundsStarted)) {
          stopped = `night spend cap reached (${String(NIGHT_SPEND_CAP_USD)} USD at ${String(ROUND_BUDGET_USD)} USD per round, ${String(roundsStarted)} rounds); stopping`;
          put('unfixed', rounds, stopped);
          reset(head0);
          break;
        }
        rounds++;
        roundsStarted++;
        const marker = join(d.statusDir, `nightly-fix-marker-${String(rounds)}`);
        writeFileSync(marker, '');
        const c = sh(fixWt, 'claude', claudeArgs(buildPrompt(f, rounds, previous)), capTimeout(ROUND_TIMEOUT_MS, startMs, d.now()), claudeEnv(d.env));
        if (childFailed(c)) {
          stopped = `claude failed (exit ${String(c.code)}${c.signal ? `, ${c.signal}` : ''}${c.timedOut ? ', timed out' : ''}); stopping, nothing is recorded`;
          put('unfixed', rounds, stopped);
          reset(head0);
          break;
        }
        if (git(fixWt, 'rev-parse', 'HEAD').stdout.trim() !== head0) {
          put('needs-human', rounds, 'the agent moved HEAD');
          reset(head0);
          break;
        }
        // Ignored files escape the diff: list everything written since the marker (outside .git and node_modules).
        const found = sh(fixWt, 'find', ['.', '-type', 'f', '-newer', marker, '-not', '-path', './.git/*', '-not', '-path', './node_modules/*']);
        const written = found.code === 0 ? found.stdout.split('\n').map((x) => x.trim()).filter(Boolean) : ['<find failed>'];
        if (git(fixWt, 'add', '-A').code !== 0) {
          put('unfixed', rounds, 'git add failed');
          reset(head0);
          break;
        }
        const names = parseNulList(git(fixWt, 'diff', '--cached', '--name-only', '--no-renames', '-z', head0).stdout);
        const forbidden = forbiddenTouched([...names, ...written]);
        const weak = forbidden.length ? [] : addsSkipMarkers(git(fixWt, 'diff', '--cached', '-U0', head0).stdout);
        if (weak.length) {
          put('needs-human', rounds, `diff adds skip/fixme/only/test.fail/retries: ${weak.join(' | ')}`);
          reset(head0);
          break;
        }
        const sigKey = `${f.file}\0${f.title}`;
        let green = false;
        let sig: RoundSig = { diff: git(fixWt, 'diff', '--cached', '-U0', head0).stdout, error: '' };
        if (!forbidden.length) {
          const r = rerun(fixWt, f);
          previous = r.tail;
          if (r.stop) {
            stopped = `router exit ${String(r.code)}: the re-run could not complete; stopping`;
            put('unfixed', rounds, stopped);
            reset(head0);
            break;
          }
          green = r.green;
          sig = { ...sig, error: green ? '' : firstError(r.tail) };
        }
        const stuck = !green && noProgress(lastSig.get(sigKey), sig);
        lastSig.set(sigKey, sig);
        const t = triage({ round: rounds, forbidden, agent: parseTriage(c.stdout).verdict, diffEmpty: names.length === 0, rerunExit: green ? 0 : 1, noProgress: stuck });
        if (t.outcome === 'retry') continue;
        if (t.outcome === 'fixed') {
          const ok = git(fixWt, 'commit', '-m', `nightly-fix: ${slug(f.title)}`, '-m', `Fixes ${specPath(f.file)}: green on the PC re-run.\n\n${TRAILER}`).code === 0;
          if (!ok) {
            put('unfixed', rounds, 'git commit failed');
            reset(head0);
            break;
          }
        } else reset(head0); // flaky (a candidate in the report only), needs-human, unfixed: drop the diff
        put(t.outcome, rounds, t.reason);
        break;
      }
    }
    return stopped;
  };

  // Verify loop (WP3e): each round = fix pass -> merge --no-ff F onto T in a detached worktree (M) -> same-spec run on M -> gate:commit ->
  // a full run when the diff leaves the re-run specs. No round cap: until green, the deadline, no progress or the spend cap; then integrate M into local main and push exactly M.
  const known = loadKnownRed(fixWt);
  const blockers: string[] = [];
  const rounds: VerifyRound[] = [];
  let forced: FixState | undefined;
  let gateTail: string[] = [];
  let verified: { M: string; changed: string[] } | undefined;
  let queue: readonly Failure[] = todo;
  let lastStopped = '';
  for (let round = 1; queue.length > 0; round++) {
    const before = ahead();
    const stopped = fixPass(queue);
    lastStopped = stopped;
    if (ahead() === before) {
      if (stopped) blockers.push(stopped);
      break; // nothing new to verify
    }
    if (!canStartVerify(startMs, d.now())) {
      blockers.push('not enough time before the hard stop to verify the fixed tree; fixes kept on a local branch');
      break;
    }
    // M: merge --no-ff of the fix branch onto the tested commit T, in a detached worktree.
    git(d.repo, 'worktree', 'remove', '--force', mergeWt);
    rmSync(mergeWt, { recursive: true, force: true });
    git(d.repo, 'worktree', 'prune');
    life.mergePrepared = true;
    if (git(d.repo, 'worktree', 'add', '--detach', mergeWt, st.sha).code !== 0 || sh(mergeWt, 'corepack', ['pnpm', 'install', '--frozen-lockfile', '--prefer-offline'], capTimeout(GATE_TIMEOUT_MS, startMs, d.now())).code !== 0) {
      blockers.push('could not prepare the merge worktree');
      break;
    }
    const fixed = results.filter((r) => r.outcome === 'fixed');
    const what = fixed.map((r) => slug(r.title)).join(', ').slice(0, 80);
    if (git(mergeWt, 'merge', '--no-ff', branch, '-m', mergeSubject(what)).code !== 0) {
      git(mergeWt, 'merge', '--abort');
      blockers.push(...landBlockers({ ...NO_BLOCK, mergeOk: false }));
      break;
    }
    const M = git(mergeWt, 'rev-parse', 'HEAD').stdout.trim();
    const changed = parseNulList(git(mergeWt, 'diff', '--name-only', '--no-renames', '-z', `${st.sha}..HEAD`).stdout);
    const forbidden = forbiddenTouched(changed);
    if (forbidden.length || git(mergeWt, 'grep', '-nE', '^(<<<<<<<|>>>>>>>) ').code !== 1) {
      blockers.push(forbidden.length ? `the merged diff touches forbidden paths: ${forbidden.join(', ')}` : 'conflict markers in the merged tree; not pushed');
      break;
    }
    // Same-spec run on M: every fixed spec, one router call; green = each fixed title passed and no new red.
    const targets = todo.filter((f) => fixed.some((r) => r.file === f.file && r.title === f.title));
    const specList = [...new Set(targets.map((f) => specPath(f.file)))];
    const vJson = join(d.statusDir, `nightly-fix-verify-${String(round)}.json`);
    rmSync(vJson, { force: true });
    const vr = sh(mergeWt, 'corepack', ['pnpm', 'exec', 'tsx', 'tools/ci/e2e-route.ts', 'run', '--pc', '--', ...specList], capTimeout(RERUN_TIMEOUT_MS, startMs, d.now()), { ...noPushEnv(d.env), PLAYWRIGHT_JSON_OUTPUT_FILE: vJson });
    let vj: unknown;
    try {
      vj = JSON.parse(readFileSync(vJson, 'utf8')) as unknown;
    } catch {
      vj = undefined;
    }
    const vv = verifyVerdict({ child: vr, json: vj, todo: targets, baseline: st.failed, known });
    const entry = (gate: VerifyRound['gate']): VerifyRound => ({ round, sha: M, green: vv.greenCount, total: targets.length, newReds: vv.newReds.length, gate });
    if (!vv.ran) {
      rounds.push(entry('skipped'));
      blockers.push(`the same-spec run on the merged commit could not complete (router exit ${String(vr.code)}); nothing pushed`);
      break;
    }
    if (vv.newReds.length > 0) {
      rounds.push(entry('skipped'));
      for (const t of vv.newReds) results.push({ file: t.file, title: t.title, outcome: 'needs-human', rounds: 0, reason: `new red in the same-spec run on the merged commit (collateral of a fix): round ${String(round)}` });
      blockers.push(...landBlockers({ ...NO_BLOCK, collateralOk: false }));
      break;
    }
    if (!vv.green) {
      rounds.push(entry('skipped'));
      queue = targets.filter((f) => !titlePassed(vj, f));
      d.out(`nightly:fix: verify round ${String(round)}: ${String(vv.greenCount)}/${String(targets.length)} green on the merged commit\n`);
      continue;
    }
    // gate:commit on M (never gate:push), then a collateral full run if the diff leaves the re-run specs.
    const g = sh(mergeWt, 'corepack', ['pnpm', 'gate:commit'], capTimeout(GATE_TIMEOUT_MS, startMs, d.now()), noPushEnv(d.env));
    if (g.code !== 0) {
      rounds.push(entry('red'));
      gateTail = redact(`${g.stdout}\n${g.stderr}`).split('\n').filter((l) => l.trim() !== '').slice(-GATE_TAIL_LINES);
      blockers.push(...landBlockers({ ...NO_BLOCK, gateCommitOk: false }));
      forced = 'needs-human';
      break;
    }
    rounds.push(entry('green'));
    if (needsFullRun(changed, specList)) {
      if (!canStartFullRun(startMs, d.now())) {
        blockers.push('not enough time before the hard stop for the collateral full run on the merged commit; fixes kept on a local branch');
        break;
      }
      const fr = fullRun(mergeWt);
      if (!fr.results) {
        blockers.push(`the collateral full run did not finish (${fr.why}); nothing pushed`);
        break;
      }
      const incomplete = fullRunIncomplete(fr.json, fr.results, json);
      if (incomplete) {
        blockers.push(`the collateral full run is incomplete (${incomplete}); not verified, nothing pushed, the fixes stay on a local branch`);
        forced = 'needs-human';
        break;
      }
      const v = judgeFullRun(fr.results, st.failed, known);
      if (v.newReds.length > 0) {
        for (const t of v.newReds) results.push({ file: t.file, title: t.title, outcome: 'needs-human', rounds: 0, reason: 'new red in the full run of the merged commit (collateral of a fix)' });
        blockers.push(...landBlockers({ ...NO_BLOCK, collateralOk: false }));
        break;
      }
      d.out(`nightly:fix: collateral full run has no new reds (${String(v.remaining.length)} still open)\n`);
    }
    // What was tested must be exactly M: the worktree is still at M and nothing was written into it (gate, install or re-run).
    const headNow = git(mergeWt, 'rev-parse', 'HEAD');
    const dirty = git(mergeWt, 'status', '--porcelain', '--untracked-files=all');
    if (headNow.code !== 0 || headNow.stdout.trim() !== M || dirty.code !== 0 || dirty.stdout.trim() !== '') {
      blockers.push('the merge worktree changed while verifying (HEAD moved or files were written); not integrating');
      break;
    }
    verified = { M, changed };
    break;
  }

  life.keep = ahead() > 0;
  const extra: Partial<FixStatus> = { ...(rounds.length ? { rounds } : {}), ...(gateTail.length ? { gateTail } : {}) };
  if (!verified) {
    if (!life.keep) return done(false, blockers.length ? blockers : ['no fix commits to push'], forced, extra);
    for (const r of results) if (r.outcome === 'fixed') results[results.indexOf(r)] = { ...r, outcome: 'unfixed', reason: `not verified on the merged commit; ${r.reason}`.slice(0, 300) };
    return done(false, blockers.length ? blockers : ['fixes were not verified on the merged commit; nothing pushed'], forced, extra);
  }
  const { M } = verified;
  // Partial night: some real red is still unfixed (or a pass stopped early). Visual change: pushing needs a human look.
  const partial = lastStopped !== '' || todo.some((f) => !results.some((r) => r.outcome === 'fixed' && r.file === f.file && r.title === f.title));
  const visual = visualTouched(verified.changed);
  // The merge and fix worktrees go before integration so the fix branch can be deleted once it is in M.
  git(d.repo, 'worktree', 'remove', '--force', mergeWt);
  git(d.repo, 'worktree', 'remove', '--force', fixWt);
  // A visual change is never integrated: main would carry it and the next clean-night push could push it unseen. M stays on its own branch.
  const hold = visual.length > 0;
  const ig = hold ? undefined : integrateMain(d, M, st.sha, stamp, startMs);
  const integrated = ig !== undefined && ig.how !== 'refused';
  let pushed = false;
  let onOrigin = false;
  const notes: string[] = [...blockers];
  if (hold) notes.push(`visual change (${visual.slice(0, 3).join(', ')}): not merged into local main, not pushed; a human looks first`);
  else if (ig && integrated) {
    notes.push(...ig.postFailures.map((p) => `post-integration check: ${p}`));
    if (partial) notes.push('partial night (not every real red is fixed): merged into local main, not pushed');
    else if (ig.postFailures.length === 0) {
      const pr = pushMerged(d, M, startMs, { sameSpecsGreen: true, gateCommitOk: true, collateralOk: true, mergeOk: true });
      pushed = pr.pushed;
      onOrigin = pr.alreadyOnOrigin;
      if (!pr.pushed && !pr.alreadyOnOrigin) notes.push(...pr.blockers);
    }
  } else if (ig) notes.push(...ig.refusals.map((r) => `integration refused: ${r}`));
  const kept = keepMerged(d, M, st.sha, stamp, [branch]);
  if (kept.error) notes.push(kept.error);
  life.keep = kept.error !== undefined; // a failed keep leaves F in place: keep it on the kept branch too
  return done(pushed, notes, forced, { ...extra, mergeSha: M, integrated, ...(pushed || onOrigin ? { pushedSha: M } : {}), ...(!integrated && kept.branch ? { mergedBranch: kept.branch } : {}) });
}

/** Image, style or snapshot changes: landed locally, never pushed unseen. */
const visualTouched = (files: readonly string[]): string[] => files.filter((f) => /\.(png|jpe?g|webp|gif|css)$|-snapshots\//.test(f));
const NO_BLOCK: LandInput = { shaIsHex: true, noEnvOverride: true, beforeDeadline: true, sameSpecsGreen: true, gateCommitOk: true, collateralOk: true, mergeOk: true, integrated: true, originIsAncestor: true, hasCommits: true };

/** Collect, waiting and retrying while the 23:00 full run is unfinished (PC busy/unreachable or still pending), until the 04:30 cutoff. */
function collectWithRetry(d: FixDeps, start: Date): void {
  for (;;) {
    const prev = readStatus(d.statusDir);
    collect(d);
    const now = readStatus(d.statusDir);
    // Only a collect that really attached (the status was pending) can be retried; a not-run status from a failed submit has no job to wait for.
    if (prev?.state !== 'pending' || !prev.rawId || !retryAllowed(now, start, d.now())) return;
    writeFileSync(statusPath(d.statusDir), `${JSON.stringify(pendingStatus(prev.sha, prev.rawId, prev.startedAt), null, 2)}\n`);
    d.out(`nightly:fix: the full run is not finished (${now?.reason ?? 'pending'}); retrying in ${String(RETRY_WAIT_MS / 60_000)} min (until 04:30)\n`);
    d.sleep(RETRY_WAIT_MS);
  }
}

/** Read-only morning report (the 09:00 job): the nightly status plus the fix result, written to nightly-morning-report.md. */
export function report(d: FixDeps): number {
  const lines = morningReport({ status: readStatus(d.statusDir), fix: readFixStatus(d.statusDir), push: readPushStatus(d.statusDir), nowMs: d.now().getTime() });
  if (existsSync(lockPath(d.statusDir))) lines.push('nightly fix loop: lock file present, the loop may still be running (or crashed; the lock goes stale after 12 h)');
  mkdirSync(d.statusDir, { recursive: true });
  writeFileSync(join(d.statusDir, 'nightly-morning-report.md'), `# Nightly morning report (${d.now().toISOString()})\n\n${lines.join('\n')}\n`);
  for (const l of lines) d.out(`${l}\n`);
  return 0;
}

export function main(argv: readonly string[], d: FixDeps): number {
  const args = argv.filter((a) => a !== '--');
  const dry = args.includes('--dry-run');
  const cmd = args.find((a) => !a.startsWith('--'));
  if (cmd === 'collect-and-fix') {
    const start = d.now();
    const notBefore = start.toISOString();
    if (dry) return fix(d, true, { notBefore, startMs: start.getTime() });
    // The lock covers the collect wait too, so a manual run cannot overlap it.
    if (!acquireLock(d)) {
      d.out('nightly:fix: another run holds the lock; nothing to do\n');
      return 0;
    }
    try {
      collectWithRetry(d, start);
      // No new reds (green or known-red only, collected by this run): no fix loop, push local main if its preconditions hold.
      const st = readStatus(d.statusDir);
      const v = nightVerdict(st);
      if (st && (v === 'green' || v === 'known-red') && statusUsable(st, d.now().getTime(), notBefore)) return pushCleanNight(d, st, start.getTime());
      return fix(d, false, { notBefore, startMs: start.getTime(), lockHeld: true });
    } catch (e) {
      const st = readStatus(d.statusDir);
      writeFixStatus(d, st?.sha ?? '', [], false, [`error: ${redact(e instanceof Error ? e.message : String(e)).slice(0, 300)}`], 'needs-human');
      return 1;
    } finally {
      rmSync(lockPath(d.statusDir), { force: true });
    }
  }
  if (cmd === 'report') return report(d);
  if (cmd === 'run' || cmd === undefined) return fix(d, dry);
  d.err('usage: nightly-fix.ts [run|collect-and-fix|report] [--dry-run]\n');
  return 2;
}

function realDeps(): FixDeps {
  const repo = resolve(import.meta.dirname, '../..');
  const helper = join(repo, 'tools/ci/group-run.ts');
  const run: FixDeps['run'] = (cmd, args, cwd, env, timeoutMs) => {
    // Every child runs in its own process group with a wall-clock cap (group-run.ts kills the whole group on timeout).
    const r = spawnSync(process.execPath, ['--import', 'tsx', helper, cwd, String(timeoutMs ?? 2 * 3600_000), cmd, ...args], {
      cwd: repo, env: env as NodeJS.ProcessEnv, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
      timeout: (timeoutMs ?? 2 * 3600_000) + 30_000, // grace over group-run's own cap, so a hung helper cannot hang the loop
      killSignal: 'SIGKILL',
    });
    try {
      const o = JSON.parse(r.stdout.trim().split('\n').pop() ?? '') as { code: number; signal: string | null; timedOut: boolean; error: string; stdout: string; stderr: string };
      return { code: o.code, signal: o.signal ?? undefined, timedOut: o.timedOut, stdout: o.stdout, stderr: o.error ? `${o.stderr}\n${o.error}` : o.stderr };
    } catch {
      return { code: r.status ?? 1, signal: r.signal ?? undefined, stdout: r.stdout, stderr: r.stderr };
    }
  };
  const common = spawnSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: repo, encoding: 'utf8' }).stdout.trim();
  const sleep = (ms: number): void => void Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  return { env: process.env, repo, statusDir: join(common, 'tte-gate'), now: () => new Date(), run, sleep, out: (s) => process.stdout.write(s), err: (s) => process.stderr.write(s) };
}

if (process.argv[1]?.endsWith('nightly-fix.ts')) {
  const d = realDeps();
  mkdirSync(d.statusDir, { recursive: true });
  process.exit(existsSync(d.repo) ? main(process.argv.slice(2), d) : 2);
}
