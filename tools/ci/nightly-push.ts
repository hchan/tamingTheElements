/**
 * Clean-night push (the 02:00 `nightly-fix.ts collect-and-fix` job): when the collected 23:00 full e2e is green, or red only with
 * known-red tests (tools/ci/known-red.json), push local main to origin/main with the shared plain push (`PUSH_ARGS`, never forced,
 * never another branch). Preconditions, all checked in `cleanPushBlockers` (pure): the checkout is on main with a clean tree,
 * origin/main (fetched) is an ancestor of main, main is still the commit the full run tested, there is something to push,
 * `gate:commit` passes on main (credentials stripped, pushes disabled), no Mac-lane env override, before the hard stop.
 * A new (unrecorded) red never pushes here: that night goes to the fix loop. Report: tte-gate/nightly-push-status.json.
 * Tests: tests/repo/nightly-push.test.ts.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { BLOCKING_ENV, capTimeout, deadlineReached, GATE_TIMEOUT_MS, noPushEnv, PUSH_ARGS } from './nightly-fix-logic';
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
  readonly onMain: boolean;
  readonly treeClean: boolean;
  /** `git merge-base --is-ancestor origin/main HEAD` after a fetch. */
  readonly originIsAncestor: boolean;
  /** HEAD is the commit the full run tested (no untested commits merged since 23:00). */
  readonly testedIsHead: boolean;
  readonly hasCommits: boolean;
  readonly gateCommitOk: boolean;
}

/** Every reason not to push; empty means push. */
export function cleanPushBlockers(i: CleanPushInput): string[] {
  const out: string[] = [];
  if (i.verdict === 'new-red') out.push('the full run has new (unrecorded) reds; no plain push');
  if (i.verdict === 'not-run') out.push('no completed full run (not-run, pending or stale); no push');
  if (!i.noEnvOverride) out.push(`one of ${BLOCKING_ENV.join(', ')} is set; no push`);
  if (!i.onMain) out.push('the checkout is not on main');
  if (!i.treeClean) out.push('the working tree on main is not clean');
  if (!i.originIsAncestor) out.push('origin/main is not an ancestor of main (diverged); no push, never forced');
  if (!i.testedIsHead) out.push('main moved since the full run (untested commits); not pushed');
  if (!i.hasCommits) out.push('main has nothing to push');
  if (!i.gateCommitOk) out.push('gate:commit failed on main');
  return out;
}

export interface PushStatus {
  readonly schema: 1;
  readonly verdict: NightVerdict;
  readonly sha: string;
  readonly pushed: boolean;
  readonly blockers: readonly string[];
  readonly finishedAt: string;
}

export const pushStatusPath = (dir: string): string => join(dir, 'nightly-push-status.json');

export function describePush(s: PushStatus | undefined): string[] {
  if (!s) return [];
  const head = `nightly clean push (${s.finishedAt}): ${s.verdict} run at ${s.sha.slice(0, 7)}`;
  return s.pushed ? [`${head}: pushed main to origin/main`] : [`${head}: not pushed`, ...s.blockers.map((b) => `  - ${b}`)];
}

export function readPushStatus(dir: string): PushStatus | undefined {
  try {
    const v = JSON.parse(readFileSync(pushStatusPath(dir), 'utf8')) as PushStatus;
    return v.schema === 1 ? v : undefined;
  } catch {
    return undefined;
  }
}

/** Check the preconditions on the main checkout (`d.repo`) and push main when none blocks. Writes the push status; returns 0. */
export function pushCleanNight(d: PushDeps, st: NightlyStatus, startMs: number): number {
  const git = (...a: string[]): { code: number; stdout: string } => d.run('git', a, d.repo, d.env);
  const verdict = nightVerdict(st);
  const finish = (pushed: boolean, blockers: string[]): number => {
    const s: PushStatus = { schema: 1, verdict, sha: st.sha, pushed, blockers, finishedAt: d.now().toISOString() };
    mkdirSync(d.statusDir, { recursive: true });
    writeFileSync(pushStatusPath(d.statusDir), `${JSON.stringify(s, null, 2)}\n`);
    for (const l of describePush(s)) d.out(`${l}\n`);
    return 0;
  };
  git('fetch', 'origin', 'main');
  const head = (): string => git('rev-parse', 'HEAD').stdout.trim();
  const clean = (): boolean => {
    const s = git('status', '--porcelain');
    return s.code === 0 && s.stdout.trim() === '';
  };
  const sha = head();
  const count = Number.parseInt(git('rev-list', '--count', 'origin/main..HEAD').stdout.trim(), 10);
  const cheap: CleanPushInput = {
    verdict,
    noEnvOverride: !BLOCKING_ENV.some((k) => d.env[k]),
    onMain: git('symbolic-ref', '--short', 'HEAD').stdout.trim() === 'main',
    treeClean: clean(),
    originIsAncestor: git('merge-base', '--is-ancestor', 'origin/main', 'HEAD').code === 0,
    testedIsHead: sha !== '' && sha === st.sha,
    hasCommits: Number.isFinite(count) && count > 0,
    gateCommitOk: true,
  };
  const first = cleanPushBlockers(cheap);
  if (first.length) return finish(false, first);
  if (deadlineReached(startMs, d.now())) return finish(false, ['hard stop reached before gate:commit; nothing pushed']);
  const gate = d.run('corepack', ['pnpm', 'gate:commit'], d.repo, noPushEnv(d.env), capTimeout(GATE_TIMEOUT_MS, startMs, d.now()));
  // The gate ran on the live checkout: re-read HEAD and the tree so nothing that changed meanwhile is pushed.
  const after = cleanPushBlockers({ ...cheap, gateCommitOk: gate.code === 0, treeClean: clean(), testedIsHead: head() === st.sha });
  if (after.length) return finish(false, after);
  if (d.run('git', PUSH_ARGS, d.repo, d.env).code !== 0) return finish(false, ['git push failed (not forced)']);
  return finish(true, []);
}
