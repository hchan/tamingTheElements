/**
 * Nightly fix loop (runs after `nightly:collect` when the status is red with unrecorded failures):
 *   pnpm nightly:fix [--dry-run]            fix loop only (needs a collected red status)
 *   pnpm nightly:collect-and-fix [--dry-run] collect, then the fix loop (what the 06:00 LaunchAgent runs)
 * Per failure: a headless `claude -p` round in a fresh worktree from origin/main (.scratch/nightly-fix-wt), then a re-run of
 * that spec only via the router (`--pc`: PC only, never the Mac; exits 89/94/95/96 stop the loop and are reported). At most
 * 3 rounds. Outcomes: fixed (commit), flaky (known-red entry + idea file), needs-human. Forbidden paths are checked on the
 * diff in code. Push only if every precondition in nightly-fix-logic.ts `pushBlockers` holds (merge --no-ff in a second
 * worktree, conflict-marker grep, gate:push, re-run green, origin unmoved); never forced. Report: tte-gate/nightly-fix-*.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { collect, readStatus, type Deps, type RunResult } from './nightly-e2e';
import {
  buildPrompt, claudeArgs, extractFailures, finalState, forbiddenTouched, describeFix, mergeSubject, parsePorcelainZ, parseTriage, pushBlockers, ROUND_TIMEOUT_MS,
  shouldRun, slug, specPath, stopsLoop, triage, type Failure, type FailureResult, type FixStatus,
} from './nightly-fix-logic';

export interface FixDeps extends Omit<Deps, 'run'> {
  run: (cmd: string, args: readonly string[], cwd: string, env: Readonly<Record<string, string | undefined>>, timeoutMs?: number) => RunResult;
}
const BLOCKING_ENV = ['CI', 'TTE_E2E_LOCAL', 'TTE_ALLOW_MAC_E2E'];
const FIX_WT = join('.scratch', 'nightly-fix-wt');
const MERGE_WT = join('.scratch', 'nightly-fix-merge');
const HARNESS_PATHS = ['tools/ci/known-red.json'];
const fixStatusPath = (dir: string): string => join(dir, 'nightly-fix-status.json');

export function readFixStatus(dir: string): FixStatus | undefined {
  try {
    const v = JSON.parse(readFileSync(fixStatusPath(dir), 'utf8')) as FixStatus;
    return v.schema === 1 ? v : undefined;
  } catch {
    return undefined;
  }
}

function writeFixStatus(d: FixDeps, sha: string, results: FailureResult[], pushed: boolean, blockers: string[]): FixStatus {
  const s: FixStatus = { schema: 1, state: finalState(results, pushed), sha, finishedAt: d.now().toISOString(), pushed, results, blockers };
  mkdirSync(d.statusDir, { recursive: true });
  writeFileSync(fixStatusPath(d.statusDir), `${JSON.stringify(s, null, 2)}\n`);
  writeFileSync(join(d.statusDir, 'nightly-fix-report.md'), `${describeFix(s).join('\n')}\n`);
  for (const l of describeFix(s)) d.out(`${l}\n`);
  return s;
}

export function fix(d: FixDeps, dry: boolean): number {
  for (const k of BLOCKING_ENV) {
    if (d.env[k]) {
      d.err(`nightly:fix: refusing to run with ${k} set (PC only)\n`);
      return 2;
    }
  }
  const st = readStatus(d.statusDir);
  if (!shouldRun(st) || !st) {
    d.out(`nightly:fix: nothing to do (${st ? `${st.state}, ${String(st.unrecorded.length)} unrecorded` : 'no status'})\n`);
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
  const routerRerun = (f: Failure): string[] => ['pnpm', 'exec', 'tsx', 'tools/ci/e2e-route.ts', 'run', '--pc', '--', specPath(f.file)];
  if (dry) {
    d.out(`nightly:fix dry run for ${st.sha.slice(0, 7)}: ${String(failures.length)} failure(s); nothing is launched or pushed\n`);
    d.out(`  worktree: git worktree add -B ${branch} ${fixWt} origin/main (then pnpm install --frozen-lockfile --prefer-offline)\n`);
    for (const f of failures) {
      d.out(`--- ${f.file}: ${f.title}\n  claude ${claudeArgs('<prompt>').slice(2).join(' ')}\n  re-run: corepack ${routerRerun(f).join(' ')}\n${buildPrompt(f, 1, '')}\n`);
    }
    d.out(`  push: merge --no-ff ${branch} in ${mergeWt} ("${mergeSubject('<what>')}"), conflict-marker grep, corepack pnpm gate:push, re-run failed specs, git push origin HEAD:main (no force)\n`);
    return 0;
  }

  const sh = (cwd: string, cmd: string, args: string[], timeout?: number): RunResult => d.run(cmd, args, cwd, d.env, timeout);
  const git = (cwd: string, ...a: string[]): RunResult => sh(cwd, 'git', a);
  const prep = (wt: string, br: string): boolean => {
    git(d.repo, 'worktree', 'remove', '--force', wt);
    rmSync(wt, { recursive: true, force: true });
    git(d.repo, 'worktree', 'prune');
    if (git(d.repo, 'worktree', 'add', '-B', br, wt, 'origin/main').code !== 0) return false;
    return sh(wt, 'corepack', ['pnpm', 'install', '--frozen-lockfile', '--prefer-offline']).code === 0;
  };
  const results: FailureResult[] = [];
  const done = (pushed: boolean, blockers: string[]): number => {
    writeFixStatus(d, st.sha, results, pushed, blockers);
    return 0;
  };
  if (git(d.repo, 'fetch', 'origin', 'main').code !== 0) return done(false, ['git fetch failed']);
  const base = git(d.repo, 'rev-parse', 'origin/main').stdout.trim();
  const shaOnOrigin = git(d.repo, 'merge-base', '--is-ancestor', st.sha, 'origin/main').code === 0;
  if (!shaOnOrigin) return done(false, ['the nightly ran on commits that are not on origin/main; fix locally']);
  if (!prep(fixWt, branch)) return done(false, ['could not prepare the fix worktree']);

  let stopped = '';
  for (const f of failures) {
    if (stopped) {
      results.push({ file: f.file, title: f.title, outcome: 'unfixed', rounds: 0, reason: stopped });
      continue;
    }
    let previous = '';
    let rounds = 0;
    for (;;) {
      rounds++;
      const c = sh(fixWt, 'claude', claudeArgs(buildPrompt(f, rounds, previous)), ROUND_TIMEOUT_MS);
      const changed = parsePorcelainZ(git(fixWt, 'status', '--porcelain=v1', '-z', '--untracked-files=all').stdout);
      const forbidden = forbiddenTouched(changed);
      let rerun = 1;
      if (!forbidden.length) {
        const r = sh(fixWt, 'corepack', routerRerun(f), 40 * 60_000);
        rerun = r.code;
        previous = `${r.stdout}\n${r.stderr}`.split('\n').slice(-40).join('\n');
        if (stopsLoop(r.code)) {
          stopped = `router exit ${String(r.code)}: re-run could not complete; stopping`;
          results.push({ file: f.file, title: f.title, outcome: 'unfixed', rounds, reason: stopped });
          git(fixWt, 'reset', '--hard', 'HEAD');
          git(fixWt, 'clean', '-fd');
          break;
        }
      }
      const t = triage({ round: rounds, forbidden, agent: parseTriage(c.stdout).verdict, diffEmpty: changed.length === 0, rerunExit: rerun });
      if (t.outcome === 'retry') continue;
      if (t.outcome === 'fixed' || t.outcome === 'flaky') {
        if (t.outcome === 'flaky') recordKnownRed(fixWt, f, stamp);
        git(fixWt, 'add', '-A');
        git(fixWt, 'commit', '-m', `nightly-fix: ${t.outcome} ${f.file}: ${f.title}\n\n${t.reason}`);
      } else {
        git(fixWt, 'reset', '--hard', 'HEAD');
        git(fixWt, 'clean', '-fd');
      }
      results.push({ file: f.file, title: f.title, outcome: t.outcome, rounds, reason: t.reason });
      break;
    }
  }

  const hasCommits = git(fixWt, 'rev-list', '--count', `origin/main..${branch}`).stdout.trim() !== '0';
  if (!hasCommits) return done(false, stopped ? [stopped] : ['no commits to push']);
  const blockers = integrate(d, { branch, mergeWt, base, shaOnOrigin, results, specs: results.filter((r) => r.outcome === 'fixed').map((r) => specPath(r.file)) }, prep, sh, git);
  if (blockers.length === 0) {
    const push = git(mergeWt, 'push', 'origin', 'HEAD:main');
    if (push.code !== 0) blockers.push('git push failed (not forced)');
  }
  return done(blockers.length === 0, blockers);
}

/** Merge --no-ff into a fresh main-based worktree and run every push precondition; returns the blockers (empty = pushed-ready). */
function integrate(
  d: FixDeps,
  o: { branch: string; mergeWt: string; base: string; shaOnOrigin: boolean; results: FailureResult[]; specs: string[] },
  prep: (wt: string, br: string) => boolean,
  sh: (cwd: string, cmd: string, args: string[], timeout?: number) => RunResult,
  git: (cwd: string, ...a: string[]) => RunResult,
): string[] {
  const noEnvOverride = !['CI', 'TTE_E2E_LOCAL', 'TTE_ALLOW_MAC_E2E'].some((k) => d.env[k]);
  const fail = (partial: Partial<Parameters<typeof pushBlockers>[0]>): string[] =>
    pushBlockers({ hasCommits: true, shaOnOrigin: o.shaOnOrigin, mergeOk: true, forbidden: [], markersClean: true, gatePushOk: true, rerunGreen: true, originUnmoved: true, noEnvOverride, ...partial });
  if (!prep(o.mergeWt, `${o.branch}-merge`)) return ['could not prepare the merge worktree'];
  const what = o.results.map((r) => slug(r.title)).join(', ').slice(0, 80);
  const merged = git(o.mergeWt, 'merge', '--no-ff', o.branch, '-m', mergeSubject(what)).code === 0;
  if (!merged) {
    git(o.mergeWt, 'merge', '--abort');
    return fail({ mergeOk: false });
  }
  const names = git(o.mergeWt, 'diff', '--name-only', `${o.base}..HEAD`).stdout.split('\n').filter(Boolean);
  const forbidden = forbiddenTouched(names.filter((n) => !HARNESS_PATHS.includes(n)));
  const markersClean = git(o.mergeWt, 'grep', '-nE', '^(<<<<<<<|>>>>>>>) ').code === 1;
  const rerunGreen = o.specs.every((s) => sh(o.mergeWt, 'corepack', ['pnpm', 'exec', 'tsx', 'tools/ci/e2e-route.ts', 'run', '--pc', '--', s], 40 * 60_000).code === 0);
  const gatePushOk = forbidden.length === 0 && markersClean && sh(o.mergeWt, 'corepack', ['pnpm', 'gate:push'], 90 * 60_000).code === 0;
  git(d.repo, 'fetch', 'origin', 'main');
  const originUnmoved = git(d.repo, 'rev-parse', 'origin/main').stdout.trim() === o.base;
  return fail({ forbidden, markersClean, gatePushOk, rerunGreen, originUnmoved });
}

/** Record a flaky/noise failure in tools/ci/known-red.json (+ the idea file tests/repo/known-red.test.ts requires). */
function recordKnownRed(wt: string, f: Failure, stamp: string): void {
  const file = join(wt, 'tools/ci/known-red.json');
  const raw = JSON.parse(readFileSync(file, 'utf8')) as { schema: 1; entries: unknown[] };
  const idea = `ideas/in-progress/nightly-flaky-${slug(f.title)}.md`;
  raw.entries.push({ file: specPath(f.file), titleIncludes: f.title, tier: 'P1', firstSeen: stamp, idea, status: 'open' });
  writeFileSync(file, `${JSON.stringify(raw, null, 2)}\n`);
  writeFileSync(
    join(wt, idea),
    `---\nstatus: in-progress\nadded: ${stamp}\n---\n\n# Nightly flaky: ${f.title}\n\nRed in the full nightly e2e, green on the single re-run with no code change (nightly:fix). Recorded in tools/ci/known-red.json.\nFollow-up: stress it alone (\`pnpm e2e:flake\`, PC only), then fix the test or the app race and mark the entry fixed.\n\nError seen:\n\n\`\`\`\n${f.message}\n\`\`\`\n`,
  );
}

export function main(argv: readonly string[], d: FixDeps): number {
  const args = argv.filter((a) => a !== '--');
  const dry = args.includes('--dry-run');
  const cmd = args.find((a) => !a.startsWith('--'));
  if (cmd === 'collect-and-fix') {
    if (!dry) collect(d);
    return fix(d, dry);
  }
  if (cmd === 'run' || cmd === undefined) return fix(d, dry);
  d.err('usage: nightly-fix.ts [run|collect-and-fix] [--dry-run]\n');
  return 2;
}

function realDeps(): FixDeps {
  const repo = resolve(import.meta.dirname, '../..');
  const run: FixDeps['run'] = (cmd, args, cwd, env, timeoutMs) => {
    const r = spawnSync(cmd, [...args], { cwd, env: env as NodeJS.ProcessEnv, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...(timeoutMs ? { timeout: timeoutMs, killSignal: 'SIGKILL' as const } : {}) });
    return { code: r.status ?? 1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
  };
  const common = run('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], repo, process.env).stdout.trim();
  return { env: process.env, repo, statusDir: join(common, 'tte-gate'), now: () => new Date(), run, out: (s) => process.stdout.write(s), err: (s) => process.stderr.write(s) };
}

if (process.argv[1]?.endsWith('nightly-fix.ts')) {
  const d = realDeps();
  mkdirSync(d.statusDir, { recursive: true });
  process.exit(existsSync(d.repo) ? main(process.argv.slice(2), d) : 2);
}
