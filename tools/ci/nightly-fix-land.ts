/**
 * Landing of verified nightly fixes (WP3c; plan: .scratch/plans/nightly-wp3-push-path.md sections 3-4). Not wired into nightly-fix.ts yet.
 * `integrateMain` merges the verified merge commit M (built on the tested sha T) into the local main checkout without ever touching a
 * dirty tree: it refuses (writing nothing) on any `integrationRefusals` reason, predicts conflicts with `merge-tree`, merges with
 * explicit flags (`--ff-only`, or `--no-ff --no-edit`, both `--no-autostash --no-overwrite-ignore`), aborts only a merge it started
 * (MERGE_HEAD == M) and never resets, forces or stashes. `pushMerged` pushes exactly M with a plain `git push origin <M>:main`
 * (`pushArgsFor`), then dispatches Pages. `keepMerged` keeps M on a local branch and deletes sources only after verifying it.
 * Tests: tests/repo/nightly-fix-land.test.ts (fake runner).
 */
import { existsSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { BLOCKING_ENV, deadlineFor, deadlineReached, forbiddenTouched, integrationRefusals, landBlockers, mergedBranchName, mergeSubject, parseNulList } from './nightly-fix-logic';
import { dispatchPages, pushArgsFor, type PushDeps } from './nightly-push';

export type LandDeps = PushDeps;

/** State files whose presence means another git operation owns the checkout. */
export const OPERATION_PATHS: readonly string[] = ['MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'BISECT_LOG', 'rebase-merge', 'rebase-apply', 'sequencer', 'index.lock'];
const MARKERS = '^(<<<<<<<|>>>>>>>) ';

export interface IntegrateResult {
  /** `ff`/`merge`: main moved to M or a merge of it; `already`: M was in main; `refused`: nothing written (or the merge failed and was undone). */
  readonly how: 'ff' | 'merge' | 'already' | 'refused';
  readonly refusals: readonly string[];
  /** main after the call (or before it when refused); '' when unreadable. */
  readonly main: string;
  /** Post-check failures (reported, never undone). */
  readonly postFailures: readonly string[];
  /** Files changed in main by the merge. */
  readonly changed: readonly string[];
}

const real = (p: string): string => {
  try {
    return realpathSync(p);
  } catch {
    return resolve(p);
  }
};

/** Merge M into local main (the repo checkout) when safe. `tested` is T; `date` names the merge subject. */
export function integrateMain(d: LandDeps, M: string, tested: string, date: string, startMs: number): IntegrateResult {
  const g = (...a: string[]): { code: number; stdout: string; stderr: string } => d.run('git', ['--no-optional-locks', ...a], d.repo, d.env);
  const out = (r: { stdout: string }): string => r.stdout.trim();
  const refused = (refusals: string[], main = ''): IntegrateResult => ({ how: 'refused', refusals, main, postFailures: [], changed: [] });
  const isAnc = (a: string, b: string): boolean => a !== '' && b !== '' && g('merge-base', '--is-ancestor', a, b).code === 0;
  const tracked = (): boolean => g('status', '--porcelain=v1', '--untracked-files=no').stdout.trim() === '';

  const wt = g('worktree', 'list', '--porcelain');
  const blocks = wt.stdout.split(/\n\s*\n/).filter((b) => b.split('\n').includes('branch refs/heads/main'));
  const wtPath = blocks.length === 1 ? ((blocks[0] ?? '').split('\n').find((l) => l.startsWith('worktree '))?.slice('worktree '.length) ?? '') : '';
  const sym = g('symbolic-ref', '-q', 'HEAD');
  const hidden = g('ls-files', '-v').stdout.split('\n').filter((l) => /^[a-zS] /.test(l));
  const ops = OPERATION_PATHS.filter((n) => {
    const p = out(g('rev-parse', '--git-path', n));
    return p !== '' && existsSync(resolve(d.repo, p));
  });
  const o = out(g('rev-parse', '--verify', 'refs/heads/main'));
  const base = {
    msLeft: deadlineFor(new Date(startMs)).getTime() - d.now().getTime(),
    mainCheckedOutHere: blocks.length === 1 && wtPath !== '' && real(wtPath) === real(d.repo),
    headIsMain: sym.code === 0 && out(sym) === 'refs/heads/main',
    trackedClean: tracked() && hidden.length === 0,
    operationsInProgress: ops,
    testedIsAncestor: isAnc(tested, o),
    mergeTreeClean: undefined,
    markersClean: undefined,
    forbidden: [] as string[],
  };
  const early = deadlineReached(startMs, d.now()) ? ['hard stop reached before integrating into main'] : [];
  const first = [...early, ...integrationRefusals(base)];
  if (first.length || o === '') return refused(first.length ? first : ['main ref unreadable'], o);
  if (isAnc(M, o)) return { how: 'already', refusals: [], main: o, postFailures: [], changed: [] };

  const mt = g('merge-tree', '--write-tree', '--name-only', '--no-messages', o, M);
  const lines = mt.stdout.split('\n').filter(Boolean);
  const p = mt.code === 0 ? (lines[0] ?? '') : '';
  const conflicts = mt.code === 0 ? [] : lines.slice(1);
  const markersClean = p === '' ? undefined : g('grep', '-nE', MARKERS, p).code === 1;
  const forbidden = p === '' ? [] : forbiddenTouched(parseNulList(g('diff', '--name-only', '--no-renames', '-z', o, p).stdout));
  const second = integrationRefusals({ ...base, mergeTreeClean: mt.code === 0 && p !== '', markersClean, forbidden });
  if (second.length) return refused(conflicts.length ? [...second, `conflicting paths: ${conflicts.join(', ')}`] : second, o);
  if (out(g('rev-parse', '--verify', 'refs/heads/main')) !== o) return refused(['main moved while checking; not merged'], o);

  const ff = isAnc(o, M);
  const flags = ['--no-autostash', '--no-overwrite-ignore'];
  const mg = ff ? g('merge', '--ff-only', ...flags, M) : g('merge', '--no-ff', ...flags, '--no-edit', '-m', mergeSubject(`nightly fixes ${date}`), M);
  if (mg.code !== 0) {
    // Only undo a merge this call started (a signing failure leaves MERGE_HEAD == M and a merged index).
    if (out(g('rev-parse', '-q', '--verify', 'MERGE_HEAD')) === M) g('merge', '--abort');
    const now = out(g('rev-parse', '--verify', 'refs/heads/main'));
    const why = (mg.stderr || mg.stdout).split('\n').find((l) => l.trim() !== '') ?? 'git merge failed';
    const extra = [...(now !== o ? ['main moved after the failed merge'] : []), ...(tracked() ? [] : ['tracked changes remain after the failed merge'])];
    return refused([`git merge failed: ${why.split(d.repo).join('<repo>').slice(0, 200)}`, ...extra], now);
  }
  const n = out(g('rev-parse', '--verify', 'refs/heads/main'));
  const post: string[] = [];
  if (!isAnc(o, n)) post.push('previous main is not an ancestor of main after the merge');
  if (!isAnc(M, n)) post.push('M is not an ancestor of main after the merge');
  if (out(g('rev-parse', `${n}^{tree}`)) !== out(g('rev-parse', `${p}^{tree}`))) post.push('main tree differs from the predicted merge tree');
  if (g('grep', '-nE', MARKERS, n).code !== 1) post.push('conflict markers in main after the merge');
  if (!tracked()) post.push('tracked changes in main after the merge');
  const changed = parseNulList(g('diff', '--name-only', '--no-renames', '-z', o, n).stdout);
  return { how: ff ? 'ff' : 'merge', refusals: [], main: n, postFailures: post, changed };
}

export interface PushGreens {
  readonly sameSpecsGreen: boolean;
  readonly gateCommitOk: boolean;
  readonly collateralOk: boolean;
  readonly mergeOk: boolean;
}
export interface PushResult {
  readonly pushed: boolean;
  /** M is on origin/main (before or after the push attempt). */
  readonly alreadyOnOrigin: boolean;
  readonly blockers: readonly string[];
  readonly dispatched: boolean;
}

/** Push exactly M (plain, never forced) when `landBlockers` is empty, then dispatch Pages. */
export function pushMerged(d: LandDeps, M: string, startMs: number, greens: PushGreens): PushResult {
  const g = (...a: string[]): { code: number; stdout: string } => d.run('git', a, d.repo, d.env);
  const onOrigin = (): boolean => g('merge-base', '--is-ancestor', M, 'origin/main').code === 0;
  const done = (pushed: boolean, already: boolean, blockers: string[], dispatched = false): PushResult => ({ pushed, alreadyOnOrigin: already, blockers, dispatched });
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(M)) {
    return done(false, false, landBlockers({ ...greens, shaIsHex: false, noEnvOverride: true, beforeDeadline: true, integrated: false, originIsAncestor: false, hasCommits: false }));
  }
  g('fetch', 'origin', 'main');
  if (onOrigin()) {
    d.out('already on origin/main; nothing to push\n');
    return done(false, true, []);
  }
  const count = Number.parseInt(g('rev-list', '--count', `origin/main..${M}`).stdout.trim(), 10);
  const blockers = landBlockers({
    ...greens,
    shaIsHex: true,
    noEnvOverride: !BLOCKING_ENV.some((k) => d.env[k]),
    beforeDeadline: !deadlineReached(startMs, d.now()),
    integrated: g('merge-base', '--is-ancestor', M, 'main').code === 0,
    originIsAncestor: g('merge-base', '--is-ancestor', 'origin/main', M).code === 0,
    hasCommits: Number.isFinite(count) && count > 0,
  });
  if (blockers.length) return done(false, false, blockers);
  if (d.run('git', pushArgsFor(M), d.repo, d.env).code !== 0) {
    g('fetch', 'origin', 'main');
    return onOrigin() ? done(false, true, []) : done(false, false, ['git push failed (not forced)']);
  }
  return done(true, true, [], dispatchPages(d));
}

export interface KeepResult {
  /** The verified branch that points at M; undefined when none could be created. */
  readonly branch: string | undefined;
  /** Sources actually deleted (only after the branch was verified). */
  readonly deleted: readonly string[];
  readonly error?: string;
}

/** Keep M on `nightly-fix-merged/<date>[-n]`; delete `sources` (branches) only after `rev-parse` proves the new branch is at M. */
export function keepMerged(d: LandDeps, M: string, date: string, sources: readonly string[] = []): KeepResult {
  const g = (...a: string[]): { code: number; stdout: string } => d.run('git', a, d.repo, d.env);
  const name = mergedBranchName(date, (n) => g('rev-parse', '--verify', '-q', `refs/heads/${n}`).code === 0);
  if (!name) return { branch: undefined, deleted: [], error: 'all nightly-fix-merged branch names are taken; sources kept' };
  const made = g('branch', name, M);
  const at = g('rev-parse', '--verify', `refs/heads/${name}`);
  if (made.code !== 0 || at.code !== 0 || at.stdout.trim() !== M) return { branch: undefined, deleted: [], error: `could not create ${name} at the merge commit; sources kept` };
  return { branch: name, deleted: sources.filter((s) => g('branch', '-D', s).code === 0) };
}
