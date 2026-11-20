/**
 * Nightly fix loop (runs after `nightly:collect` when the status is red with unrecorded failures):
 *   pnpm nightly:fix [--dry-run]            fix loop only (needs a fresh collected red status)
 *   pnpm nightly:collect-and-fix [--dry-run] collect, then the fix loop (what the 06:00 LaunchAgent runs)
 * Per failure: a sandboxed headless `claude -p` round (file tools only, no user/project settings, see nightly-fix-logic.ts) in a
 * fresh worktree from origin/main (.scratch/nightly-fix-wt), then a re-run of that spec only via the router (`--pc`: PC only, never
 * the Mac; exits 89/94/95/96, signals and timeouts stop the loop). At most 3 rounds, at most 3 failures, 4 h / 22:00 cap, one run
 * at a time (lock file). Outcomes: fixed (commit), flaky (a candidate in the report only; known-red acks are the coordinator's),
 * needs-human. Forbidden paths and test-weakening edits are checked on the diff against the base, in code. Push only if every
 * precondition in nightly-fix-logic.ts `pushBlockers` holds (merge --no-ff in a second worktree, conflict-marker grep, re-run
 * green, gate:push, origin unmoved); plain `git push origin HEAD:main`, never forced. Report: tte-gate/nightly-fix-*.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { loadKnownRed } from './known-red';
import { collect, readStatus, type Deps, type RunResult } from './nightly-e2e';
import {
  addsSkipMarkers, buildPrompt, childFailed, claudeArgs, claudeEnv, deadlineReached, describeFix, extractFailures, finalState, forbiddenTouched, GATE_TIMEOUT_MS,
  LOCK_STALE_MS, MAX_FAILURES, mergeSubject, noPushEnv, parseNulList, parseTriage, pushBlockers, RERUN_TIMEOUT_MS, rerunStops, ROUND_TIMEOUT_MS, shouldRun, slug, specPath,
  statusUsable, titlePassed, tooManyFailures, triage, type FailureResult, type FixState, type FixStatus,
} from './nightly-fix-logic';
import { unrecordedFailures } from './nightly-status';
import { redact } from './redact';

export interface FixRun extends RunResult {
  signal?: string | undefined;
  timedOut?: boolean | undefined;
}
type Env = Readonly<Record<string, string | undefined>>;
export interface FixDeps extends Omit<Deps, 'run'> {
  run: (cmd: string, args: readonly string[], cwd: string, env: Env, timeoutMs?: number) => FixRun;
}
export interface FixOpts {
  /** collect-and-fix: the status must have been finished by this run's collect (finishedAt >= this). */
  readonly notBefore?: string;
}
interface Ref {
  file: string;
  title: string;
}

const BLOCKING_ENV = ['CI', 'TTE_E2E_LOCAL', 'TTE_ALLOW_MAC_E2E'];
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

function writeFixStatus(d: FixDeps, sha: string, results: FailureResult[], pushed: boolean, blockers: string[], force?: FixState): FixStatus {
  const s: FixStatus = { schema: 1, state: force ?? finalState(results, pushed), sha, finishedAt: d.now().toISOString(), pushed, results, blockers };
  mkdirSync(d.statusDir, { recursive: true });
  writeFileSync(fixStatusPath(d.statusDir), `${JSON.stringify(s, null, 2)}\n`);
  writeFileSync(join(d.statusDir, 'nightly-fix-report.md'), `${describeFix(s).join('\n')}\n`);
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
  if (dry) return fixInner(d, true, opts, [], { prepared: false });
  if (!acquireLock(d)) {
    d.out('nightly:fix: another run holds the lock; nothing to do\n');
    return 0;
  }
  const results: FailureResult[] = [];
  const life = { prepared: false };
  try {
    return fixInner(d, false, opts, results, life);
  } catch (e) {
    const st = readStatus(d.statusDir);
    writeFixStatus(d, st?.sha ?? '', results, false, [`error: ${redact(e instanceof Error ? e.message : String(e)).slice(0, 300)}`], 'needs-human');
    return 1;
  } finally {
    if (life.prepared) {
      d.run('git', ['worktree', 'remove', '--force', resolve(d.repo, FIX_WT)], d.repo, d.env);
      d.run('git', ['branch', '-D', `nightly-fix/${d.now().toISOString().slice(0, 10)}`], d.repo, d.env);
    }
    rmSync(lockPath(d.statusDir), { force: true });
  }
}

function fixInner(d: FixDeps, dry: boolean, opts: FixOpts, results: FailureResult[], life: { prepared: boolean }): number {
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
  const failures = extractFailures(json, st.unrecorded);
  const fixWt = resolve(d.repo, FIX_WT);
  const mergeWt = resolve(d.repo, MERGE_WT);
  const stamp = d.now().toISOString().slice(0, 10);
  const branch = `nightly-fix/${stamp}`;
  const startMs = d.now().getTime();
  const done = (pushed: boolean, blockers: string[]): number => {
    writeFixStatus(d, st.sha, results, pushed, blockers);
    return 0;
  };
  if (dry) {
    d.out(`nightly:fix dry run for ${st.sha.slice(0, 7)}: ${String(failures.length)} failure(s); nothing is launched or pushed\n`);
    if (tooManyFailures(failures.length)) d.out(`  more than ${String(MAX_FAILURES)} failures: the real run would report needs-human and run no rounds\n`);
    d.out(`  worktree: git worktree add -B ${branch} ${fixWt} origin/main (then pnpm install --frozen-lockfile --prefer-offline)\n`);
    for (const f of failures) {
      d.out(`--- ${f.file}: ${f.title}\n  claude ${claudeArgs('<prompt>').slice(2).join(' ')}\n  re-run: corepack ${rerunArgs(f.file).join(' ')} (PC only)\n${buildPrompt(f, 1, '')}\n`);
    }
    d.out(`  push: merge --no-ff ${branch} in ${mergeWt} ("${mergeSubject('<what>')}"), conflict-marker grep, re-run, corepack pnpm gate:push, git push origin HEAD:main (no force)\n`);
    return 0;
  }
  if (tooManyFailures(failures.length)) {
    for (const f of failures) results.push({ file: f.file, title: f.title, outcome: 'needs-human', rounds: 0, reason: `${String(failures.length)} unrecorded failures (more than ${String(MAX_FAILURES)}): a broken night, not a loop job` });
    return done(false, ['too many failures; no rounds were run']);
  }

  const sh = (cwd: string, cmd: string, args: string[], timeout?: number, env: Env = d.env): FixRun => d.run(cmd, args, cwd, env, timeout);
  const git = (cwd: string, ...a: string[]): FixRun => sh(cwd, 'git', a);
  const prep = (wt: string, br: string): boolean => {
    git(d.repo, 'worktree', 'remove', '--force', wt);
    rmSync(wt, { recursive: true, force: true });
    git(d.repo, 'worktree', 'prune');
    if (git(d.repo, 'worktree', 'add', '-B', br, wt, 'origin/main').code !== 0) return false;
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

  if (git(d.repo, 'fetch', 'origin', 'main').code !== 0) return done(false, ['git fetch failed']);
  const base = git(d.repo, 'rev-parse', 'origin/main').stdout.trim();
  const shaOnOrigin = git(d.repo, 'merge-base', '--is-ancestor', st.sha, 'origin/main').code === 0;
  if (!shaOnOrigin) return done(false, ['the nightly ran on commits that are not on origin/main; fix locally']);
  life.prepared = true;
  if (!prep(fixWt, branch)) return done(false, ['could not prepare the fix worktree']);
  const active = unrecordedFailures(st.failed, loadKnownRed(fixWt));
  const todo = failures.filter((f) => active.some((a) => a.file === f.file && a.title === f.title));
  if (todo.length === 0) return done(false, ['every failure is already recorded in known-red.json on origin/main']);

  const reset = (to: string): void => {
    git(fixWt, 'reset', '--hard', to);
    git(fixWt, 'clean', '-ffdx', '-e', 'node_modules'); // ignored files too (settings.local.json), never node_modules
  };
  let stopped = '';
  for (const f of todo) {
    const put = (outcome: FailureResult['outcome'], rounds: number, reason: string): void => {
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
      if (deadlineReached(startMs, d.now())) {
        stopped = 'wall-clock deadline reached (4 h or 22:00); stopping';
        put('unfixed', rounds, stopped);
        reset(head0);
        break;
      }
      rounds++;
      const marker = join(d.statusDir, `nightly-fix-marker-${String(rounds)}`);
      writeFileSync(marker, '');
      const c = sh(fixWt, 'claude', claudeArgs(buildPrompt(f, rounds, previous)), ROUND_TIMEOUT_MS, claudeEnv(d.env));
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

  const count = git(fixWt, 'rev-list', '--count', `origin/main..${branch}`);
  if (count.code !== 0) return done(false, ['git rev-list failed']);
  if (count.stdout.trim() === '0') return done(false, stopped ? [stopped] : ['no fix commits to push']);
  if (deadlineReached(startMs, d.now())) return done(false, ['wall-clock deadline reached before the merge steps; nothing pushed']);
  const blockers = integrate(d, { branch, mergeWt, base, shaOnOrigin, results }, prep, sh, git, rerun);
  if (blockers.length === 0 && git(mergeWt, 'push', 'origin', 'HEAD:main').code !== 0) blockers.push('git push failed (not forced)');
  git(d.repo, 'worktree', 'remove', '--force', mergeWt);
  git(d.repo, 'branch', '-D', `${branch}-merge`);
  return done(blockers.length === 0, blockers);
}

/** Merge --no-ff into a fresh main-based worktree and run every push precondition (cheap ones first); empty = ready to push. */
function integrate(
  d: FixDeps,
  o: { branch: string; mergeWt: string; base: string; shaOnOrigin: boolean; results: FailureResult[] },
  prep: (wt: string, br: string) => boolean,
  sh: (cwd: string, cmd: string, args: string[], timeout?: number, env?: Env) => FixRun,
  git: (cwd: string, ...a: string[]) => FixRun,
  rerun: (cwd: string, f: Ref) => { green: boolean },
): string[] {
  const noEnvOverride = !BLOCKING_ENV.some((k) => d.env[k]);
  const fail = (partial: Partial<Parameters<typeof pushBlockers>[0]>): string[] =>
    pushBlockers({ hasCommits: true, shaOnOrigin: o.shaOnOrigin, mergeOk: true, forbidden: [], markersClean: true, gatePushOk: true, rerunGreen: true, originUnmoved: true, noEnvOverride, ...partial });
  if (!prep(o.mergeWt, `${o.branch}-merge`)) return ['could not prepare the merge worktree'];
  const fixed = o.results.filter((r) => r.outcome === 'fixed');
  const what = fixed.map((r) => slug(r.title)).join(', ').slice(0, 80);
  if (git(o.mergeWt, 'merge', '--no-ff', o.branch, '-m', mergeSubject(what)).code !== 0) {
    git(o.mergeWt, 'merge', '--abort');
    return fail({ mergeOk: false });
  }
  const forbidden = forbiddenTouched(parseNulList(git(o.mergeWt, 'diff', '--name-only', '--no-renames', '-z', `${o.base}..HEAD`).stdout));
  const markersClean = git(o.mergeWt, 'grep', '-nE', '^(<<<<<<<|>>>>>>>) ').code === 1;
  if (forbidden.length || !markersClean) return fail({ forbidden, markersClean });
  const rerunGreen = fixed.every((r) => rerun(o.mergeWt, r).green);
  const gatePushOk = rerunGreen && sh(o.mergeWt, 'corepack', ['pnpm', 'gate:push'], GATE_TIMEOUT_MS, noPushEnv(d.env)).code === 0;
  git(d.repo, 'fetch', 'origin', 'main');
  const originUnmoved = git(d.repo, 'rev-parse', 'origin/main').stdout.trim() === o.base;
  return fail({ rerunGreen, gatePushOk, originUnmoved });
}

export function main(argv: readonly string[], d: FixDeps): number {
  const args = argv.filter((a) => a !== '--');
  const dry = args.includes('--dry-run');
  const cmd = args.find((a) => !a.startsWith('--'));
  if (cmd === 'collect-and-fix') {
    const notBefore = d.now().toISOString();
    const c = dry ? 0 : collect(d);
    return Math.max(c, fix(d, dry, { notBefore }));
  }
  if (cmd === 'run' || cmd === undefined) return fix(d, dry);
  d.err('usage: nightly-fix.ts [run|collect-and-fix] [--dry-run]\n');
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
  return { env: process.env, repo, statusDir: join(common, 'tte-gate'), now: () => new Date(), run, out: (s) => process.stdout.write(s), err: (s) => process.stderr.write(s) };
}

if (process.argv[1]?.endsWith('nightly-fix.ts')) {
  const d = realDeps();
  mkdirSync(d.statusDir, { recursive: true });
  process.exit(existsSync(d.repo) ? main(process.argv.slice(2), d) : 2);
}
