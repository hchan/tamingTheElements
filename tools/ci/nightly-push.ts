/**
 * Clean-night push (the 01:00 `nightly-fix.ts collect-and-fix` job): when the collected 23:00 full e2e is green, or red only with
 * known-red tests (tools/ci/known-red.json), push the tested commit to origin/main with a plain push (never forced, never another
 * branch). Sha-based: the main checkout (its branch, a dirty tree) is never read or touched. Preconditions, `cleanPushBlockers`
 * (pure): origin/main (fetched) is an ancestor of the commit the full run tested (`st.sha`), that commit is an ancestor of main (main
 * may have moved on since 23:00), there is something to push, `gate:commit` passes on the tested commit's tree (credentials
 * stripped, pushes disabled) in the nightly worktree `.scratch/nightly-wt` (moved to the tested sha if needed; a precheck failure
 * recorded for that sha blocks without a re-run; a failed gate's full output goes to tte-gate/nightly-push-gate.log), no Mac-lane env override, before the hard stop. What is pushed is exactly the tested commit,
 * `git push origin <tested-sha>:main` (plain fast-forward, never forced); commits merged after it (untested) stay local and are
 * counted in the status file (`untestedLocal`). A tested sha that is not an ancestor of main (history rewritten) still blocks.
 * A new (unrecorded) red never pushes here: that night goes to the fix loop. After a push, the Pages build is dispatched (best effort; the daily cron is the fallback). Report: tte-gate/nightly-push-status.json.
 * Tests: tests/repo/nightly-push.test.ts.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { BLOCKING_ENV, capTimeout, deadlineReached, GATE_TIMEOUT_MS, noPushEnv } from './nightly-fix-logic';
import { readPrecheck } from './nightly-precheck';
import type { NightlyStatus } from './nightly-status';

type Env = Readonly<Record<string, string | undefined>>;
/** Structural subset of FixDeps (nightly-fix.ts), so this module does not import it back. */
export interface PushDeps {
  env: Env;
  repo: string;
  statusDir: string;
  now: () => Date;
  run: (cmd: string, args: readonly string[], cwd: string, env: Env, timeoutMs?: number) => { code: number; stdout: string; stderr: string };
  out: (s: string) => void;
}

/** Start the Pages build (ci.yml `workflow_dispatch`) after a successful push; only a push that moved origin/main gets here. */
export const DISPATCH_PAGES_ARGS: readonly string[] = ['workflow', 'run', 'ci.yml', '--ref', 'main'];

export type NightVerdict = 'green' | 'known-red' | 'new-red' | 'not-run';

/** What the collected full run says: pass, red with every failure known-red, red with a new failure, or nothing learned. */
export function nightVerdict(s: NightlyStatus | undefined): NightVerdict {
  if (s?.state === 'pass') return 'green';
  if (s?.state === 'red') return s.unrecorded.length === 0 ? 'known-red' : 'new-red';
  return 'not-run';
}

export interface CleanPushInput {
  readonly verdict: NightVerdict;
  readonly noEnvOverride: boolean;
  /** `git merge-base --is-ancestor origin/main <tested-sha>` after a fetch. */
  readonly originIsAncestor: boolean;
  /** The commit the full run tested is `main` or an ancestor of it (main may have moved on; the tested commit is what is pushed). */
  readonly testedIsAncestor: boolean;
  readonly hasCommits: boolean;
  readonly gateCommitOk: boolean;
}

/** Every reason not to push; empty means push. */
export function cleanPushBlockers(i: CleanPushInput): string[] {
  const out: string[] = [];
  if (i.verdict === 'new-red') out.push('the full run has new (unrecorded) reds; no plain push');
  if (i.verdict === 'not-run') out.push('no completed full run (not-run, pending or stale); no push');
  if (!i.noEnvOverride) out.push(`one of ${BLOCKING_ENV.join(', ')} is set; no push`);
  if (!i.originIsAncestor) out.push('origin/main is not an ancestor of the tested commit (diverged); no push, never forced');
  if (!i.testedIsAncestor) out.push('the tested commit is not an ancestor of main (history changed since the full run); not pushed');
  if (!i.hasCommits) out.push('the tested commit has nothing to push');
  if (!i.gateCommitOk) out.push('gate:commit failed on the tested commit');
  return out;
}

export interface PushStatus {
  readonly schema: 1;
  readonly verdict: NightVerdict;
  readonly sha: string;
  readonly pushed: boolean;
  readonly blockers: readonly string[];
  /** Commits on main after the tested sha that stayed local (untested); 0 when main is the tested sha. */
  readonly untestedLocal?: number;
  /** Last lines of the failed `gate:commit` output (what went red), so a blocked night explains itself. */
  readonly gateTail?: readonly string[];
  readonly finishedAt: string;
}

/** Lines of a failed gate:commit kept in the push status. */
export const GATE_TAIL_LINES = 40;

export const pushStatusPath = (dir: string): string => join(dir, 'nightly-push-status.json');

export function describePush(s: PushStatus | undefined): string[] {
  if (!s) return [];
  const head = `nightly clean push (${s.finishedAt}): ${s.verdict} run at ${s.sha.slice(0, 7)}`;
  const kept = s.untestedLocal ? [`  - ${s.untestedLocal} untested commit(s) on main stayed local`] : [];
  const gt = s.gateTail ?? [];
  const tail = gt.length ? [`  gate:commit failed on the tested commit; last ${String(gt.length)} output lines:`, ...gt.map((l) => `    | ${l}`)] : [];
  return s.pushed ? [`${head}: pushed main to origin/main (tested commit)`, ...kept] : [`${head}: not pushed`, ...s.blockers.map((b) => `  - ${b}`), ...tail, ...kept];
}

export function readPushStatus(dir: string): PushStatus | undefined {
  try {
    const v = JSON.parse(readFileSync(pushStatusPath(dir), 'utf8')) as PushStatus;
    return v.schema === 1 ? v : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Plain fast-forward push of one commit to main (same shape as `PUSH_ARGS`, with the tested sha instead of HEAD). Throws unless the
 * sha is full hex (40 or 64): `:main` would delete origin/main and `main:main` would push untested local commits.
 */
export function pushArgsFor(sha: string): readonly string[] {
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(sha)) throw new Error('pushArgsFor: refusing a sha that is not 40 or 64 hex characters');
  return ['push', 'origin', `${sha}:main`];
}

/** Start the Pages build for what was just pushed (best effort; the daily cron is the fallback). GITHUB_TOKEN is stripped because a stale one breaks gh. */
export function dispatchPages(d: Pick<PushDeps, 'env' | 'repo' | 'run' | 'out'>): boolean {
  const { GITHUB_TOKEN: _stale, ...ghEnv } = d.env;
  const dispatched = d.run('gh', DISPATCH_PAGES_ARGS, d.repo, ghEnv).code === 0;
  d.out(dispatched ? 'Pages build dispatched\n' : 'Pages dispatch failed (the daily cron will deploy)\n');
  return dispatched;
}

/** The nightly worktree the 23:00 submit checks out (nightly-e2e.ts WT_REL); the 01:00 gate runs here. */
export const NIGHTLY_WT_REL = join('.scratch', 'nightly-wt');
export const gateLogPath = (dir: string): string => join(dir, 'nightly-push-gate.log');

/** Check the preconditions (sha-based, `d.repo` is only used for refs) and push the tested commit when none blocks. Writes the push status; returns 0. */
export function pushCleanNight(d: PushDeps, st: NightlyStatus, startMs: number): number {
  const git = (...a: string[]): { code: number; stdout: string } => d.run('git', a, d.repo, d.env);
  const verdict = nightVerdict(st);
  let untested = 0;
  let gateTail: string[] = [];
  const tailOf = (r: { stdout: string; stderr: string }): string[] => `${r.stdout}\n${r.stderr}`.split('\n').filter((l) => l.trim() !== '').slice(-GATE_TAIL_LINES);
  const finish = (pushed: boolean, blockers: string[]): number => {
    const s: PushStatus = { schema: 1, verdict, sha: st.sha, pushed, blockers, untestedLocal: untested, ...(gateTail.length ? { gateTail } : {}), finishedAt: d.now().toISOString() };
    mkdirSync(d.statusDir, { recursive: true });
    writeFileSync(pushStatusPath(d.statusDir), `${JSON.stringify(s, null, 2)}\n`);
    for (const l of describePush(s)) d.out(`${l}\n`);
    return 0;
  };
  git('fetch', 'origin', 'main');
  const tested = st.sha;
  const testedOk = (): boolean => tested !== '' && git('merge-base', '--is-ancestor', tested, 'main').code === 0;
  const num = (r: { stdout: string }): number => Number.parseInt(r.stdout.trim(), 10);
  const count = num(git('rev-list', '--count', `origin/main..${tested}`));
  const moved = num(git('rev-list', '--count', `${tested}..main`));
  untested = Number.isFinite(moved) && moved > 0 ? moved : 0;
  const cheap: CleanPushInput = {
    verdict,
    noEnvOverride: !BLOCKING_ENV.some((k) => d.env[k]),
    originIsAncestor: git('merge-base', '--is-ancestor', 'origin/main', tested).code === 0,
    testedIsAncestor: testedOk(),
    hasCommits: Number.isFinite(count) && count > 0,
    gateCommitOk: true,
  };
  const first = cleanPushBlockers(cheap);
  if (first.length) return finish(false, first);
  if (deadlineReached(startMs, d.now())) return finish(false, ['hard stop reached before gate:commit; nothing pushed']);
  // The 23:00 precheck already ran gate:commit on this very sha: a recorded failure is final (no second run).
  const pre = readPrecheck(d.statusDir);
  if (pre && pre.sha === tested && !pre.pass) {
    gateTail = [...(pre.tail ?? [])];
    return finish(false, ['the 23:00 precheck gate:commit failed on the tested commit; not re-run']);
  }
  const gateEnv = noPushEnv(d.env);
  const wt = join(d.repo, NIGHTLY_WT_REL);
  const capped = (): number => capTimeout(GATE_TIMEOUT_MS, startMs, d.now());
  // Gate in the nightly worktree (same-tree stamp: a hit when the precheck passed), never in the main checkout.
  const here = d.run('git', ['rev-parse', 'HEAD'], wt, d.env);
  let ready = { code: 0, stdout: '', stderr: '' };
  if (here.code !== 0 || here.stdout.trim() !== tested) {
    mkdirSync(join(d.repo, '.scratch'), { recursive: true });
    const co = here.code === 0 ? d.run('git', ['checkout', '--detach', '--force', tested], wt, d.env) : d.run('git', ['worktree', 'add', '--detach', '--force', wt, tested], d.repo, d.env);
    ready = co.code === 0 ? d.run('corepack', ['pnpm', 'install', '--frozen-lockfile', '--prefer-offline'], wt, gateEnv, capped()) : co;
  }
  const g = ready.code === 0 ? d.run('corepack', ['pnpm', 'gate:commit'], wt, gateEnv, capped()) : ready;
  const gateOk = g.code === 0;
  if (!gateOk) {
    gateTail = tailOf(g);
    try {
      mkdirSync(d.statusDir, { recursive: true });
      writeFileSync(gateLogPath(d.statusDir), `gate:commit at ${tested} (exit ${String(g.code)})\n${g.stdout}\n${g.stderr}\n`);
    } catch {
      /* best effort; the tail is in the status */
    }
  }
  // Re-check ancestry so nothing that changed meanwhile is pushed.
  const after = cleanPushBlockers({ ...cheap, gateCommitOk: gateOk, testedIsAncestor: testedOk() });
  if (after.length) return finish(false, after);
  if (d.run('git', pushArgsFor(tested), d.repo, d.env).code !== 0) return finish(false, ['git push failed (not forced)']);
  // Pages is built only by the cron or a dispatch (not on push): start the build for what was just pushed. Best effort; the
  // 14:00 UTC cron is the fallback. GITHUB_TOKEN is stripped because a stale one breaks gh.
  dispatchPages(d);
  return finish(true, []);
}
