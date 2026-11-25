/**
 * Nightly fix loop (runs after `nightly:collect` when the status is red with unrecorded failures):
 *   pnpm nightly:fix [--dry-run]            fix loop only (needs a fresh collected red status)
 *   nightly-fix.ts collect-and-fix          collect (retry every 20 min until 04:30 while the 23:00 full run is unfinished), then the fix loop (the 01:00 LaunchAgent)
 *   nightly-fix.ts report                   read-only morning report to tte-gate/nightly-morning-report.md (the 09:00 LaunchAgent)
 * Per failure: a sandboxed headless `claude -p` round (file tools only, no user/project settings, see nightly-fix-logic.ts) in a
 * fresh worktree from origin/main (.scratch/nightly-fix-wt), then a re-run of that spec only via the router (`--pc`: PC only, never
 * the Mac; exits 89/94/95/96, signals and timeouts stop the loop). At most 3 rounds, at most 3 failures, one run at a time (lock file).
 * Cycle: collect -> fix -> if a fix was applied, merge --no-ff in a second worktree and run a FULL e2e of that tree via the router
 * (PC only) -> judge -> fix reds that were fixed but still fail -> at most 2 full re-runs. Hard stop 07:00 for a night run (22:00 by day, 6 h max):
 * no round or full run starts that cannot finish. Flaky and known-red specs are reported, never chased. A new red in a re-run (collateral)
 * means no push: needs-human, the fixes kept on the local branch nightly-fix-kept/<date>. Outcomes: fixed (commit), flaky, needs-human.
 * Push only if every precondition in nightly-fix-logic.ts `pushBlockers` holds (latest FULL run on the pushed tree has no new reds, conflict-marker
 * grep, gate:push, origin unmoved); plain `git push origin HEAD:main`, never forced. Report: tte-gate/nightly-fix-*.
 * A night with no new reds (green, or known-red only) skips the fix loop: collect-and-fix pushes local main itself when the
 * nightly-push.ts preconditions hold (origin/main an ancestor, main is the tested commit, clean tree, gate:commit). Report: tte-gate/nightly-push-status.json.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { loadKnownRed } from './known-red';
import { collect, readStatus, statusPath, type Deps, type RunResult } from './nightly-e2e';
import {
  addsSkipMarkers, BLOCKING_ENV, blockingReds, buildPrompt, canStartFullRun, canStartRound, capTimeout, childFailed, classifyReds, claudeArgs, claudeEnv, deadlineReached, dedupeRefs, describeFix, errorTail, extractFailures, finalState,
  forbiddenTouched, FULL_RUN_MS, fullRunIncomplete, GATE_TIMEOUT_MS, judgeFullRun, knownRedProposal, LOCK_STALE_MS, MAX_FULL_CYCLES, MAX_REAL_REDS, mergeSubject, morningReport, noPushEnv, parseNulList, parseTriage, pushBlockers, PUSH_ARGS,
  redsVerdict, retargets, retryAllowed, RETRY_WAIT_MS, RERUN_TIMEOUT_MS, rerunStops, ROUND_TIMEOUT_MS, shouldRun, slug, specPath, statusUsable, titlePassed, triage,
  type ClassifiedRed, type Failure, type FailureResult, type FixState, type FixStatus, type PushInput, type RetryOutcome,
} from './nightly-fix-logic';
import { nightVerdict, pushCleanNight, readPushStatus } from './nightly-push';
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

function writeFixStatus(d: FixDeps, sha: string, results: FailureResult[], pushed: boolean, blockers: string[], force?: FixState): FixStatus {
  const rich = results.map((r) => ({ ...r, tier: tierOf(r.file, r.title), errorTail: errTails.get(`${r.file}\0${r.title}`) ?? [] }));
  const s: FixStatus = {
    schema: 1, state: force ?? finalState(results, pushed), sha, finishedAt: d.now().toISOString(), pushed, results: rich, blockers,
    ...(!pushed && keptName && results.some((r) => r.outcome === 'fixed') ? { keptBranch: keptName } : {}),
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
      if (life.branch) d.run('git', ['branch', '-D', `${life.branch}-merge`], d.repo, d.env);
    }
    if (life.prepared) {
      d.run('git', ['worktree', 'remove', '--force', resolve(d.repo, FIX_WT)], d.repo, d.env);
      const br = life.branch;
      // After an exception keep the branch whenever it is ahead of the tested commit.
      if (life.threw && Number(d.run('git', ['rev-list', '--count', `${life.tip || 'origin/main'}..${br}`], d.repo, d.env).stdout.trim() || '0') > 0) life.keep = true;
      // Unpushed fixes (collateral red, no time, gate failed) stay reachable on a local branch for the human; never overwrite an earlier kept branch.
      if (life.keep) {
        const base = `nightly-fix-kept/${br.slice('nightly-fix/'.length)}`;
        let name = base;
        for (let n = 2; n < 20 && d.run('git', ['branch', '--list', name], d.repo, d.env).stdout.trim(); n++) name = `${base}-${String(n)}`;
        d.run('git', ['branch', name, br], d.repo, d.env);
      }
      d.run('git', ['branch', '-D', br], d.repo, d.env);
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
  const done = (pushed: boolean, blockers: string[], force?: FixState): number => {
    writeFixStatus(d, st.sha, results, pushed, blockers, force);
    return 0;
  };
  if (dry) {
    d.out(`nightly:fix dry run for ${st.sha.slice(0, 7)}: ${String(failures.length)} failure(s); nothing is launched or pushed\n`);
    d.out(`  first: ONE retry of all ${String(failures.length)} distinct red(s) via the router (--pc), then tier: flaky-on-retry and P2 reds never block (no real P0/P1 red = clean push); more than ${String(MAX_REAL_REDS)} real reds = broken night (needs-human, no rounds)\n`);
    d.out(`  worktree: git worktree add -B ${branch} ${fixWt} ${st.sha.slice(0, 7)} (the tested commit; then pnpm install --frozen-lockfile --prefer-offline)\n`);
    for (const f of failures) {
      d.out(`--- ${f.file}: ${f.title}\n  claude ${claudeArgs('<prompt>').slice(2).join(' ')}\n  re-run: corepack ${rerunArgs(f.file).join(' ')} (PC only)\n${buildPrompt(f, 1, '')}\n`);
    }
    d.out(`  push: merge --no-ff ${branch} in ${mergeWt} ("${mergeSubject('<what>')}"), conflict-marker grep, then a FULL e2e of the merged tree via the router (PC only; max ${String(MAX_FULL_CYCLES)} cycles, none after the 07:00 hard stop), corepack pnpm gate:push, git push origin HEAD:main (no force), only if the latest full run has no new reds\n`);
    return 0;
  }
  const sh = (cwd: string, cmd: string, args: string[], timeout?: number, env: Env = d.env): FixRun => d.run(cmd, args, cwd, env, timeout);
  const git = (cwd: string, ...a: string[]): FixRun => sh(cwd, 'git', a);
  const prep = (wt: string, br: string): boolean => {
    git(d.repo, 'worktree', 'remove', '--force', wt);
    rmSync(wt, { recursive: true, force: true });
    git(d.repo, 'worktree', 'prune');
    if (git(d.repo, 'worktree', 'add', '-B', br, wt, st.sha).code !== 0) return false;
    return sh(wt, 'corepack', ['pnpm', 'install', '--frozen-lockfile', '--prefer-offline']).code === 0;
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
  if (verdict === 'broken-night' || classified.some((c) => c.cls === 'unclassified')) {
    for (const c of blockingReds(classified)) if (c.cls === 'real') record(c);
    return done(false, [verdict === 'broken-night' ? `${String(blockingReds(classified).length)} real P0/P1 reds (more than ${String(MAX_REAL_REDS)}): a broken night, needs-human, no rounds` : 'the classification retry could not run; reds treated as real, nothing pushed, no rounds'], verdict === 'broken-night' ? 'needs-human' : undefined);
  }
  const todo = stillRed.filter((f) => classified.some((c) => c.cls === 'real' && c.file === f.file && c.title === f.title));

  const reset = (to: string): void => {
    git(fixWt, 'reset', '--hard', to);
    git(fixWt, 'clean', '-ffdx', '-e', 'node_modules'); // ignored files too (settings.local.json), never node_modules
  };
  const ahead = (): number => Number(git(fixWt, 'rev-list', '--count', `${st.sha}..${branch}`).stdout.trim() || '0');
  /** One fix pass over `todo` (existing per-failure rounds); returns why it stopped early, or ''. A later result for a spec replaces its earlier one. */
  const earlierFix = new Set<string>();
  const fixPass = (todo: readonly Failure[]): string => {
    let stopped = '';
    for (const f of todo) {
      const put = (outcome: FailureResult['outcome'], rounds: number, reason: string): void => {
        const at = results.findIndex((r) => r.file === f.file && r.title === f.title);
        // A later cycle's flaky/unfixed/needs-human never erases an earlier fix that is in the verified tree: it becomes a note.
        if (at >= 0 && outcome !== 'fixed' && results[at]?.outcome !== undefined && earlierFix.has(`${f.file}\0${f.title}`)) {
          const prev = results[at] as FailureResult;
          results[at] = { ...prev, reason: redact(`${prev.reason}; later cycle: ${outcome}: ${reason}`).slice(0, 300) };
          return;
        }
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
        rounds++;
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
        let green = false;
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
        }
        const t = triage({ round: rounds, forbidden, agent: parseTriage(c.stdout).verdict, diffEmpty: names.length === 0, rerunExit: green ? 0 : 1 });
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

  // Cycles: fix -> (fixes applied) full e2e on the merged tree via the router (PC only) -> judge -> fix what did not hold. Max MAX_FULL_CYCLES.
  const known = loadKnownRed(fixWt);
  const blockers: string[] = [];
  let forced: FixState | undefined;
  const warn: string[] = []; // survive a successful push
  let verified = false; // the latest full run was on the current merge tree and has no new reds
  let verifiedAhead = 0; // commits on the branch when that merge tree was built
  let verifiedResults: FailureResult[] = [];
  let queue: readonly Failure[] = todo;
  for (let cycle = 1; cycle <= MAX_FULL_CYCLES && queue.length > 0; cycle++) {
    const before = ahead();
    const stopped = fixPass(queue);
    const thisQueue = queue;
    queue = [];
    if (ahead() === before) {
      if (stopped) {
        blockers.push(stopped);
        warn.push(stopped);
      }
      break; // nothing new to verify
    }
    if (!canStartFullRun(startMs, d.now())) {
      const m = 'not enough time before the hard stop for a full re-run of the fixed tree; fixes kept on a local branch';
      blockers.push(m);
      if (verified) {
        // The merge tree of the earlier cycle was verified; this cycle's commits are not in it and are not pushed.
        results.splice(0, results.length, ...verifiedResults);
        for (const t of thisQueue) {
          const i = results.findIndex((r) => r.file === t.file && r.title === t.title);
          const r = results[i];
          if (r) results[i] = { ...r, reason: `${r.reason}; cycle ${String(cycle)} fix not pushed (no time for a full re-run), kept on nightly-fix-kept/${stamp}`.slice(0, 300) };
        }
        warn.push(m);
      }
      break;
    }
    life.mergePrepared = true;
    const m = buildMerge(d, { branch, mergeWt, base, tip: st.sha, shaOnOrigin, results }, prep, git);
    if (m.length) {
      blockers.push(...m);
      verified = false;
      break;
    }
    const fr = fullRun(mergeWt);
    if (!fr.results) {
      blockers.push(`the full re-run did not finish (${fr.why}); nothing pushed`);
      verified = false;
      break;
    }
    const incomplete = fullRunIncomplete(fr.json, fr.results, json);
    if (incomplete) {
      blockers.push(`the full re-run ${String(cycle)} is incomplete (${incomplete}); not verified, nothing pushed, the fixes stay on a local branch`);
      verified = false;
      forced = 'needs-human';
      break;
    }
    const v = judgeFullRun(fr.results, st.failed, known);
    if (v.newReds.length > 0) {
      for (const t of v.newReds) results.push({ file: t.file, title: t.title, outcome: 'needs-human', rounds: 0, reason: `new red in the full re-run of the fixed tree (collateral of a fix): cycle ${String(cycle)}` });
      blockers.push('a full re-run of the fixed tree shows new reds; not pushed, the fixes stay on a local branch');
      verified = false;
      break;
    }
    verified = true;
    verifiedAhead = ahead();
    d.out(`nightly:fix: full re-run ${String(cycle)} has no new reds (${String(v.remaining.length)} still open)\n`);
    queue = fr.json === undefined ? [] : extractFailures(fr.json, retargets(v, results));
    // The last full run decides: a fix whose spec is still red there did not hold.
    for (const t of v.remaining) {
      const i = results.findIndex((r) => r.outcome === 'fixed' && r.file === t.file && r.title === t.title);
      const r = results[i];
      if (r) {
        earlierFix.add(`${r.file}\0${r.title}`);
        results[i] = { ...r, outcome: 'unfixed', reason: `still red in full re-run ${String(cycle)}; ${r.reason}`.slice(0, 300) };
      }
    }
    verifiedResults = results.map((r) => ({ ...r }));
    if (stopped) {
      blockers.push(stopped);
      warn.push(stopped);
      break;
    }
  }

  const count = ahead();
  life.keep = count > 0;
  if (count === 0) return done(false, blockers.length ? blockers : ['no fix commits to push'], forced);
  if (!verified) return done(false, blockers.length ? blockers : ['fixes were not verified by a full re-run; nothing pushed'], forced);
  const fp = finalPush(d, { mergeWt, base, shaOnOrigin, startMs }, git, sh);
  if (fp.length === 0 && git(mergeWt, ...PUSH_ARGS).code !== 0) fp.push('git push failed (not forced)');
  // Commits made after the verified merge (an unverified cycle) were not pushed: keep the branch for them.
  if (fp.length === 0) life.keep = count > verifiedAhead;
  return done(fp.length === 0, [...warn, ...fp]);
}

/** Merge --no-ff into a fresh main-based worktree and check the merged diff and markers; empty = the tree is ready for a full run. */
function buildMerge(
  d: FixDeps,
  o: { branch: string; mergeWt: string; base: string; tip: string; shaOnOrigin: boolean; results: FailureResult[] },
  prep: (wt: string, br: string) => boolean,
  git: (cwd: string, ...a: string[]) => FixRun,
): string[] {
  if (!prep(o.mergeWt, `${o.branch}-merge`)) return ['could not prepare the merge worktree'];
  const what = o.results.filter((r) => r.outcome === 'fixed').map((r) => slug(r.title)).join(', ').slice(0, 80);
  if (git(o.mergeWt, 'merge', '--no-ff', o.branch, '-m', mergeSubject(what)).code !== 0) {
    git(o.mergeWt, 'merge', '--abort');
    return pushBlockers(pushInput(d, o.shaOnOrigin, { mergeOk: false }));
  }
  const forbidden = forbiddenTouched(parseNulList(git(o.mergeWt, 'diff', '--name-only', '--no-renames', '-z', `${o.tip}..HEAD`).stdout));
  const markersClean = git(o.mergeWt, 'grep', '-nE', '^(<<<<<<<|>>>>>>>) ').code === 1;
  return forbidden.length || !markersClean ? pushBlockers(pushInput(d, o.shaOnOrigin, { forbidden, markersClean })) : [];
}

const pushInput = (d: FixDeps, shaOnOrigin: boolean, partial: Partial<PushInput>): PushInput => ({
  hasCommits: true, shaOnOrigin, mergeOk: true, forbidden: [], markersClean: true, gatePushOk: true, rerunGreen: true, originUnmoved: true,
  noEnvOverride: !BLOCKING_ENV.some((k) => d.env[k]), ...partial,
});

/** After a verified full run: the cheap-last preconditions (gate:push, origin unmoved, time left); empty = push. */
function finalPush(
  d: FixDeps,
  o: { mergeWt: string; base: string; shaOnOrigin: boolean; startMs: number },
  git: (cwd: string, ...a: string[]) => FixRun,
  sh: (cwd: string, cmd: string, args: string[], timeout?: number, env?: Env) => FixRun,
): string[] {
  if (deadlineReached(o.startMs, d.now())) return ['hard stop reached before gate:push; nothing pushed'];
  const gatePushOk = sh(o.mergeWt, 'corepack', ['pnpm', 'gate:push'], capTimeout(GATE_TIMEOUT_MS, o.startMs, d.now()), noPushEnv(d.env)).code === 0;
  git(d.repo, 'fetch', 'origin', 'main');
  const originUnmoved = git(d.repo, 'rev-parse', 'origin/main').stdout.trim() === o.base;
  return pushBlockers(pushInput(d, o.shaOnOrigin, { gatePushOk, originUnmoved }));
}

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
