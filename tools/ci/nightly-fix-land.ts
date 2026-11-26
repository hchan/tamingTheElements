/**
 * Landing of verified nightly fixes (WP3c; plan: .scratch/plans/nightly-wp3-push-path.md sections 3-4). Used by nightly-fix.ts (verify loop, integrate, push).
 * `integrateMain` merges the verified merge commit M (built on the tested sha T) into the local main checkout without ever touching a
 * dirty tree: it refuses (writing nothing) on any `integrationRefusals` reason, predicts conflicts with `merge-tree`, merges with
 * explicit flags (`--ff-only`, or `--no-ff --no-edit`, both `--no-autostash --no-overwrite-ignore`), aborts only a merge it started
 * (MERGE_HEAD == M) and never resets, forces or stashes. `pushMerged` pushes exactly M with a plain `git push origin <M>:main`
 * (`pushArgsFor`), then dispatches Pages. `keepMerged` keeps M on a local branch and deletes a source only after verifying the new
 * branch, and only a `nightly-fix/*` branch already contained in M. M and T must be full hex and T an ancestor of M for integrateMain
 * and keepMerged; integrateMain also refuses under BLOCKING_ENV before any git call. Tests: tests/repo/nightly-fix-land.test.ts (fake
 * runner) and tests/repo/nightly-fix-land-real-git.test.ts (real git).
 */
import { existsSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { BLOCKING_ENV, capTimeout, deadlineFor, deadlineReached, forbiddenTouched, integrationRefusals, landBlockers, mergedBranchName, mergeSubject, parseNulList } from './nightly-fix-logic';
import { dispatchPages, pushArgsFor, type PushDeps } from './nightly-push';

export type LandDeps = PushDeps;

/** State files whose presence means another git operation owns the checkout. */
export const OPERATION_PATHS: readonly string[] = ['MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'BISECT_LOG', 'rebase-merge', 'rebase-apply', 'sequencer', 'index.lock'];
const MARKERS = '^(<<<<<<<|>>>>>>>) ';
const HEX = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const MAIN_REF = 'refs/heads/main';
const ORIGIN_MAIN_REF = 'refs/remotes/origin/main';
/** Ceilings for the merge, fetch and push children (also capped by the hard stop). */
export const MERGE_TIMEOUT_MS = 5 * 60_000;
export const NET_TIMEOUT_MS = 2 * 60_000;

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
const envBlocked = (env: LandDeps['env']): boolean => BLOCKING_ENV.some((k) => env[k]);

/** Neutral input for `integrationRefusals`, used to get the shared wording for a single early refusal. */
const NEUTRAL = { msLeft: Number.MAX_SAFE_INTEGER, mainCheckedOutHere: true, headIsMain: true, trackedClean: true, operationsInProgress: [], testedIsAncestor: true, mergeTreeClean: undefined, markersClean: undefined, forbidden: [] } as const;

/** Merge M into local main (the repo checkout) when safe. `tested` is T; `date` names the merge subject. */
export function integrateMain(d: LandDeps, M: string, tested: string, date: string, startMs: number): IntegrateResult {
  const g = (...a: string[]): { code: number; stdout: string; stderr: string } => d.run('git', ['--no-optional-locks', ...a], d.repo, d.env);
  const out = (r: { stdout: string }): string => r.stdout.trim();
  const refused = (refusals: string[], main = ''): IntegrateResult => ({ how: 'refused', refusals, main, postFailures: [], changed: [] });
  if (envBlocked(d.env)) return refused(integrationRefusals({ ...NEUTRAL, noEnvOverride: false }));
  if (!HEX.test(M) || !HEX.test(tested)) return refused(['the merge or tested sha is not full hex; not integrating']);
  const isAnc = (a: string, b: string): boolean => a !== '' && b !== '' && g('merge-base', '--is-ancestor', a, b).code === 0;
  const tracked = (): boolean => {
    const r = g('status', '--porcelain=v1', '--untracked-files=no');
    return r.code === 0 && r.stdout.trim() === '';
  };
  const headIsMain = (): boolean => {
    const r = g('symbolic-ref', '-q', 'HEAD');
    return r.code === 0 && out(r) === MAIN_REF;
  };
  /** Names of operation state files present; an unreadable git path counts as present. */
  const operations = (): string[] =>
    OPERATION_PATHS.filter((n) => {
      const r = g('rev-parse', '--git-path', n);
      const p = out(r);
      return r.code !== 0 || p === '' || existsSync(resolve(d.repo, p));
    });
  const readMain = (): string => {
    const r = g('rev-parse', '--verify', MAIN_REF);
    return r.code === 0 ? out(r) : '';
  };

  if (!isAnc(tested, M)) return refused(['the tested commit is not an ancestor of the merge commit; not integrating']);
  const wt = g('worktree', 'list', '--porcelain');
  const blocks = wt.code !== 0 ? [] : wt.stdout.split(/\n\s*\n/).filter((b) => b.split('\n').includes(`branch ${MAIN_REF}`));
  const wtPath = blocks.length === 1 ? ((blocks[0] ?? '').split('\n').find((l) => l.startsWith('worktree '))?.slice('worktree '.length) ?? '') : '';
  const lsv = g('ls-files', '-v');
  const hidden = lsv.stdout.split('\n').filter((l) => /^[a-zS] /.test(l));
  const o = readMain();
  const base = {
    msLeft: deadlineFor(new Date(startMs)).getTime() - d.now().getTime(),
    mainCheckedOutHere: blocks.length === 1 && wtPath !== '' && real(wtPath) === real(d.repo),
    headIsMain: headIsMain(),
    trackedClean: tracked() && lsv.code === 0 && hidden.length === 0,
    operationsInProgress: operations(),
    testedIsAncestor: isAnc(tested, o),
    mergeTreeClean: undefined,
    markersClean: undefined,
    forbidden: [] as string[],
    noEnvOverride: true,
  };
  const early = deadlineReached(startMs, d.now()) ? ['hard stop reached before integrating into main'] : [];
  const first = [...early, ...integrationRefusals(base)];
  if (first.length || o === '') return refused(first.length ? first : ['main ref unreadable'], o);
  if (isAnc(M, o)) return { how: 'already', refusals: [], main: o, postFailures: [], changed: [] };

  const mt = g('merge-tree', '--write-tree', '--name-only', '--no-messages', o, M);
  const lines = mt.stdout.split('\n').filter(Boolean);
  const p = mt.code === 0 ? (lines[0] ?? '') : '';
  const conflicts = mt.code === 1 ? lines.slice(1) : [];
  const markersClean = p === '' ? undefined : g('grep', '-nE', MARKERS, p).code === 1;
  const df = p === '' ? undefined : g('diff', '--name-only', '--no-renames', '-z', o, p);
  const forbidden = df === undefined || df.code !== 0 ? [] : forbiddenTouched(parseNulList(df.stdout));
  const extra: string[] = [];
  if (mt.code !== 0 && mt.code !== 1) extra.push(`merge-tree failed (exit ${String(mt.code)})`);
  if (df !== undefined && df.code !== 0) extra.push(`diff of the merged tree failed (exit ${String(df.code)})`);
  const second = [...integrationRefusals({ ...base, mergeTreeClean: mt.code === 0 ? p !== '' : mt.code === 1 ? false : undefined, markersClean, forbidden }), ...extra];
  if (second.length) return refused(conflicts.length ? [...second, `conflicting paths: ${conflicts.join(', ')}`] : second, o);
  // Re-check everything another process could have changed since the first look, right before writing.
  if (readMain() !== o) return refused(['main moved while checking; not merged'], o);
  if (!headIsMain()) return refused(['the repo checkout left main while checking; not merged'], o);
  const opsNow = operations();
  if (opsNow.length) return refused([`git operation started while checking: ${opsNow.join(', ')}; not merged`], o);

  const ff = isAnc(o, M);
  const flags = ['--no-autostash', '--no-overwrite-ignore'];
  const mergeArgs = ff ? ['merge', '--ff-only', ...flags, M] : ['merge', '--no-ff', ...flags, '--no-edit', '-m', mergeSubject(`nightly fixes ${date}`), M];
  const mg = d.run('git', ['--no-optional-locks', ...mergeArgs], d.repo, d.env, capTimeout(MERGE_TIMEOUT_MS, startMs, d.now()));
  if (mg.code !== 0) {
    const extras: string[] = [];
    // Only undo a merge this call started (a signing failure leaves MERGE_HEAD == M and a merged index).
    if (out(g('rev-parse', '-q', '--verify', 'MERGE_HEAD')) === M) {
      g('merge', '--abort');
      if (g('rev-parse', '-q', '--verify', 'MERGE_HEAD').code === 0) extras.push('MERGE_HEAD still present after merge --abort; run git merge --abort by hand');
    }
    const now = readMain();
    const why = (mg.stderr || mg.stdout).split('\n').find((l) => l.trim() !== '') ?? 'git merge failed';
    if (now !== o) extras.push('main moved after the failed merge');
    if (!tracked()) extras.push('tracked changes remain after the failed merge');
    let clean = why;
    const home = homedir();
    for (const [secret, label] of [[real(d.repo), '<repo>'], [d.repo, '<repo>'], [home, '~']] as const) if (secret.length > 1) clean = clean.split(secret).join(label);
    return refused([`git merge failed: ${clean.slice(0, 200)}`, ...extras], now);
  }
  const n = readMain();
  const post: string[] = [];
  if (!isAnc(o, n)) post.push('previous main is not an ancestor of main after the merge');
  if (!isAnc(M, n)) post.push('M is not an ancestor of main after the merge');
  const nt = out(g('rev-parse', `${n}^{tree}`));
  const pt = out(g('rev-parse', `${p}^{tree}`));
  if (nt === '' || pt === '' || nt !== pt) post.push('main tree differs from the predicted merge tree');
  if (g('grep', '-nE', MARKERS, n).code !== 1) post.push('conflict markers in main after the merge');
  if (!tracked()) post.push('tracked changes in main after the merge');
  const dn = g('diff', '--name-only', '--no-renames', '-z', o, n);
  if (dn.code !== 0) post.push('could not list the files changed in main');
  return { how: ff ? 'ff' : 'merge', refusals: [], main: n, postFailures: post, changed: dn.code === 0 ? parseNulList(dn.stdout) : [] };
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
  const netEnv = { ...d.env, GIT_TERMINAL_PROMPT: '0' };
  const net = (...a: string[]): { code: number; stdout: string } => d.run('git', a, d.repo, netEnv, capTimeout(NET_TIMEOUT_MS, startMs, d.now()));
  const onOrigin = (): boolean => g('merge-base', '--is-ancestor', M, ORIGIN_MAIN_REF).code === 0;
  const done = (pushed: boolean, already: boolean, blockers: string[], dispatched = false): PushResult => ({ pushed, alreadyOnOrigin: already, blockers, dispatched });
  const cheap = { ...greens, noEnvOverride: !envBlocked(d.env), beforeDeadline: !deadlineReached(startMs, d.now()) };
  if (!HEX.test(M)) return done(false, false, landBlockers({ ...cheap, shaIsHex: false, integrated: false, originIsAncestor: false, hasCommits: false }));
  // Everything that needs no git first, so a refused night never touches the network.
  const early = landBlockers({ ...cheap, shaIsHex: true, integrated: true, originIsAncestor: true, hasCommits: true });
  if (early.length) return done(false, false, early);
  if (net('fetch', 'origin', 'main').code !== 0) return done(false, false, ['fetch failed; not pushed']);
  if (onOrigin()) {
    d.out('already on origin/main; nothing to push\n');
    return done(false, true, []);
  }
  const count = Number.parseInt(g('rev-list', '--count', `${ORIGIN_MAIN_REF}..${M}`).stdout.trim(), 10);
  const blockers = landBlockers({
    ...cheap,
    shaIsHex: true,
    integrated: g('merge-base', '--is-ancestor', M, MAIN_REF).code === 0,
    originIsAncestor: g('merge-base', '--is-ancestor', ORIGIN_MAIN_REF, M).code === 0,
    hasCommits: Number.isFinite(count) && count > 0,
  });
  if (blockers.length) return done(false, false, blockers);
  if (net(...pushArgsFor(M)).code !== 0) {
    net('fetch', 'origin', 'main');
    return onOrigin() ? done(false, true, []) : done(false, false, ['git push failed (not forced)']);
  }
  return done(true, true, [], dispatchPages(d));
}

export interface KeepResult {
  /** The verified branch that points at M; undefined when none could be created. */
  readonly branch: string | undefined;
  /** Sources actually deleted (only after the branch was verified). */
  readonly deleted: readonly string[];
  /** Sources left alone (not `nightly-fix/*`, not contained in M, or the branch could not be made). */
  readonly kept: readonly string[];
  readonly error?: string;
}

/**
 * Keep M on `nightly-fix-merged/<date>[-n]`; then delete only those `sources` that are `nightly-fix/*` branches contained in M,
 * and only after `rev-parse` proves the new branch is at M. A source that is ahead of M (a partial night) survives.
 */
export function keepMerged(d: LandDeps, M: string, tested: string, date: string, sources: readonly string[] = []): KeepResult {
  const g = (...a: string[]): { code: number; stdout: string } => d.run('git', a, d.repo, d.env);
  const fail = (error: string): KeepResult => ({ branch: undefined, deleted: [], kept: sources, error });
  if (!HEX.test(M) || !HEX.test(tested)) return fail('the merge or tested sha is not full hex; sources kept');
  if (g('merge-base', '--is-ancestor', tested, M).code !== 0) return fail('the tested commit is not an ancestor of the merge commit; sources kept');
  const name = mergedBranchName(date, (n) => g('rev-parse', '--verify', '-q', `refs/heads/${n}`).code === 0);
  if (!name) return fail('all nightly-fix-merged branch names are taken; sources kept');
  const made = g('branch', name, M);
  const at = g('rev-parse', '--verify', `refs/heads/${name}`);
  if (made.code !== 0 || at.code !== 0 || at.stdout.trim() !== M) return fail(`could not create ${name} at the merge commit; sources kept`);
  const deletable = (s: string): boolean => s.startsWith('nightly-fix/') && s !== 'main' && g('merge-base', '--is-ancestor', `refs/heads/${s}`, M).code === 0;
  const deleted: string[] = [];
  const kept: string[] = [];
  for (const s of sources) (deletable(s) && g('branch', '-D', s).code === 0 ? deleted : kept).push(s);
  return { branch: name, deleted, kept };
}
