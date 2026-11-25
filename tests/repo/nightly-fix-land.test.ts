import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { integrateMain, keepMerged, pushMerged, type LandDeps } from '../../tools/ci/nightly-fix-land';
import { DISPATCH_PAGES_ARGS, pushArgsFor } from '../../tools/ci/nightly-push';

const T = 'a'.repeat(40);
const M = 'b'.repeat(40);
const O = 'c'.repeat(40);
const N = 'd'.repeat(40);
const P = 'e'.repeat(40);
const START = new Date(2026, 10, 25, 1, 0, 0).getTime();
const NOW = new Date(START + 60_000);

interface World {
  repo: string;
  /** git subcommand (after --no-optional-locks) -> handler result; missing keys default to success/empty. */
  worktree?: string;
  sym?: string;
  status?: string;
  lsv?: string;
  opFile?: string;
  main?: string;
  /** ancestor pairs "a>b" that hold */
  anc: Set<string>;
  mergeTree?: { code: number; stdout: string };
  grep?: number;
  diff?: string;
  merge?: { code: number; stderr?: string };
  mergeHead?: string;
  /** tracked status after a failed merge */
  statusAfter?: string;
  mainAfter?: string;
  origin?: { fetchMovesTo?: string; count?: string; pushCode?: number };
  branches?: Set<string>;
  branchCreateFails?: boolean;
  calls: string[][];
  ran: string[];
  out: string[];
  merged?: boolean;
}

let root = '';
beforeEach(() => {
  root = mkdtempSync(join(resolve('.scratch'), 'land-'));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function world(over: Partial<World> = {}): World {
  mkdirSync(join(root, 'git'), { recursive: true });
  return { repo: root, anc: new Set([`${T}>${O}`, `${O}>${O}`, `${T}>${T}`]), calls: [], ran: [], out: [], ...over };
}

function deps(w: World, env: Record<string, string | undefined> = {}, now: Date = NOW): LandDeps {
  const run: LandDeps['run'] = (cmd, args) => {
    const a = args[0] === '--no-optional-locks' ? args.slice(1) : [...args];
    w.calls.push([cmd, ...a]);
    const ok = (stdout = '', code = 0, stderr = ''): { code: number; stdout: string; stderr: string } => ({ code, stdout, stderr });
    if (cmd === 'gh') return ok();
    const mainNow = w.merged ? (w.main === O ? N : (w.mainAfter ?? N)) : (w.main ?? O);
    switch (a[0]) {
      case 'worktree': return ok(w.worktree ?? `worktree ${w.repo}\nHEAD ${O}\nbranch refs/heads/main\n`);
      case 'symbolic-ref': return ok(w.sym ?? 'refs/heads/main\n');
      case 'status': return ok(w.merged ? '' : (w.status ?? ''));
      case 'ls-files': return ok(w.lsv ?? 'H a.ts\n');
      case 'rev-parse':
        if (a[1] === '--git-path') return ok(a[2] === w.opFile ? 'git/FLAG' : 'git/none');
        if (a[1] === '-q') return ok(w.mergeHead ?? '', w.mergeHead ? 0 : 1);
        if (a[2] === 'refs/heads/main') return ok(`${mainNow}\n`);
        if ((a.at(-1) ?? '').startsWith('refs/heads/nightly-fix-merged')) return w.branches?.has((a.at(-1) ?? '').slice('refs/heads/'.length)) ? ok(`${M}\n`) : ok('', 1);
        if (a[1]?.endsWith('^{tree}')) return ok(a[1].startsWith(N) || a[1].startsWith(P) ? 'tree1\n' : 'tree2\n');
        return ok();
      case 'merge-base': return ok('', w.anc.has(`${a[2] ?? ''}>${a[3] ?? ''}`) ? 0 : 1);
      case 'merge-tree': return w.mergeTree ? ok(w.mergeTree.stdout, w.mergeTree.code) : ok(`${P}\n`);
      case 'grep': return ok('', a[3] === N || a[3] === P ? (w.grep ?? 1) : 1);
      case 'diff': return ok(w.diff ?? 'src/a.ts\0');
      case 'merge':
        if (a[1] === '--abort') {
          w.ran.push('abort');
          w.mergeHead = undefined;
          return ok();
        }
        w.ran.push(a.slice(1).join(' '));
        if (w.merge && w.merge.code !== 0) return ok('', w.merge.code, w.merge.stderr ?? '');
        w.merged = true;
        w.anc.add(`${O}>${N}`).add(`${M}>${N}`);
        return ok();
      case 'fetch': return ok();
      case 'rev-list': return ok(`${w.origin?.count ?? '1'}\n`);
      case 'push': return ok('', w.origin?.pushCode ?? 0);
      case 'branch': {
        if (a[1] === '-D') return ok();
        if (w.branchCreateFails) return ok('', 1);
        w.branches ??= new Set();
        w.branches.add(a[1] ?? '');
        return ok();
      }
      default: return ok();
    }
  };
  return { env: { ...env }, repo: w.repo, statusDir: join(root, 'status'), now: () => now, run, out: (s) => w.out.push(s) };
}

const call = (w: World, sub: string): string[][] => w.calls.filter((c) => c[1] === sub);

describe('integrateMain', () => {
  it('refuses writing nothing for each precondition', () => {
    const cases: [string, Partial<World>, RegExp][] = [
      ['main elsewhere', { worktree: `worktree /elsewhere\nbranch refs/heads/main\n` }, /not checked out exactly once/],
      ['two checkouts', { worktree: `worktree ${root}\nbranch refs/heads/main\n\nworktree /x\nbranch refs/heads/main\n` }, /exactly once/],
      ['other branch', { sym: 'refs/heads/other\n' }, /not on main/],
      ['dirty tracked', { status: ' M src/a.ts\n' }, /uncommitted tracked/],
      ['assume-unchanged', { lsv: 'h src/a.ts\n' }, /uncommitted tracked/],
      ['skip-worktree', { lsv: 'S src/a.ts\n' }, /uncommitted tracked/],
      ['merge in progress', { opFile: 'MERGE_HEAD' }, /MERGE_HEAD/],
      ['index.lock', { opFile: 'index.lock' }, /index\.lock/],
      ['history changed', { anc: new Set() }, /not an ancestor of main/],
      ['conflict', { mergeTree: { code: 1, stdout: `${P}\nsrc/a.ts\n` } }, /would conflict[\s\S]*src\/a\.ts|src\/a\.ts/],
      ['markers', { grep: 0 }, /conflict markers/],
      ['forbidden path', { diff: 'package.json\0' }, /forbidden paths: package\.json/],
    ];
    for (const [name, over, re] of cases) {
      const w = world(over);
      if (over.opFile) writeFileSync(join(root, 'git', 'FLAG'), '');
      const r = integrateMain(deps(w), M, T, '2026-11-25', START);
      expect(r.how, name).toBe('refused');
      expect(r.refusals.join(' | '), name).toMatch(re);
      expect(call(w, 'merge'), name).toHaveLength(0);
    }
  });

  it('refuses when the deadline has passed', () => {
    const w = world();
    const r = integrateMain(deps(w, {}, new Date(START + 7 * 3_600_000)), M, T, '2026-11-25', START);
    expect(r.how).toBe('refused');
    expect(r.refusals.join(' ')).toMatch(/hard stop|time left/);
    expect(call(w, 'merge')).toHaveLength(0);
  });

  it('M already in main: nothing merged', () => {
    const w = world();
    w.anc.add(`${M}>${O}`);
    const r = integrateMain(deps(w), M, T, '2026-11-25', START);
    expect(r.how).toBe('already');
    expect(call(w, 'merge')).toHaveLength(0);
  });

  it('main == T (O is an ancestor of M): fast-forward with explicit flags', () => {
    const w = world();
    w.anc.add(`${O}>${M}`);
    const r = integrateMain(deps(w), M, T, '2026-11-25', START);
    expect(r).toMatchObject({ how: 'ff', main: N, postFailures: [], changed: ['src/a.ts'] });
    expect(w.ran).toEqual([`--ff-only --no-autostash --no-overwrite-ignore ${M}`]);
  });

  it('main moved on: --no-ff merge with the nightly subject', () => {
    const w = world();
    const r = integrateMain(deps(w), M, T, '2026-11-25', START);
    expect(r.how).toBe('merge');
    expect(w.ran[0]).toBe(`--no-ff --no-autostash --no-overwrite-ignore --no-edit -m Merge nightly fixes 2026-11-25 (nightly-fix) ${M}`);
    expect(call(w, 'merge-tree')[0]).toContain('--write-tree');
  });

  it('a failed merge aborts only when MERGE_HEAD is M, then refuses with the redacted first stderr line', () => {
    const w = world({ merge: { code: 128, stderr: `error: cannot sign in ${root}/x\nmore\n` }, mergeHead: M });
    const r = integrateMain(deps(w), M, T, '2026-11-25', START);
    expect(r.how).toBe('refused');
    expect(w.ran).toContain('abort');
    expect(r.refusals[0]).toBe('git merge failed: error: cannot sign in <repo>/x');
    expect(r.main).toBe(O);
    const w2 = world({ merge: { code: 1 }, mergeHead: 'f'.repeat(40) });
    integrateMain(deps(w2), M, T, '2026-11-25', START);
    expect(w2.ran).not.toContain('abort');
  });

  it('never uses force, reset, stash, checkout or update-ref in the main checkout', () => {
    const w = world();
    integrateMain(deps(w), M, T, '2026-11-25', START);
    expect(w.calls.filter((c) => ['reset', 'stash', 'checkout', 'update-ref'].includes(c[1] ?? ''))).toEqual([]);
  });
});

describe('pushMerged', () => {
  const greens = { sameSpecsGreen: true, gateCommitOk: true, collateralOk: true, mergeOk: true };
  const base = (): World => {
    const w = world();
    w.anc.add(`${M}>${N}`).add(`${O}>${M}`);
    w.anc.add(`${M}>main`).add(`origin/main>${M}`);
    return w;
  };

  it('happy path: plain push of M, then the Pages dispatch', () => {
    const w = base();
    const r = pushMerged(deps(w), M, START, greens);
    expect(r).toMatchObject({ pushed: true, blockers: [], dispatched: true });
    expect(call(w, 'push')).toEqual([['git', ...pushArgsFor(M)]]);
    expect(call(w, 'push')[0]?.join(' ')).not.toMatch(/--force|-f\b|\+/);
    expect(w.calls.filter((c) => c[0] === 'gh').map((c) => c.slice(1))).toEqual([[...DISPATCH_PAGES_ARGS]]);
  });

  it('already on origin/main: no push', () => {
    const w = base();
    w.anc.add(`${M}>origin/main`);
    const r = pushMerged(deps(w), M, START, greens);
    expect(r).toMatchObject({ pushed: false, alreadyOnOrigin: true });
    expect(call(w, 'push')).toHaveLength(0);
  });

  it('each blocker stops the push', () => {
    const cases: [string, (w: World) => void, Record<string, string>, Partial<typeof greens>, RegExp][] = [
      ['not integrated', (w) => w.anc.delete(`${M}>main`), {}, {}, /not in local main/],
      ['origin diverged', (w) => w.anc.delete(`origin/main>${M}`), {}, {}, /never forced/],
      ['no commits', (w) => (w.origin = { count: '0' }), {}, {}, /nothing to push/],
      ['env override', () => undefined, { CI: '1' }, {}, /CI, TTE_E2E_LOCAL/],
      ['same specs red', () => undefined, {}, { sameSpecsGreen: false }, /same-spec/],
      ['gate red', () => undefined, {}, { gateCommitOk: false }, /gate:commit/],
      ['collateral red', () => undefined, {}, { collateralOk: false }, /new reds/],
      ['merge failed', () => undefined, {}, { mergeOk: false }, /merge --no-ff/],
    ];
    for (const [name, setup, env, g, re] of cases) {
      const w = base();
      setup(w);
      const r = pushMerged(deps(w, env), M, START, { ...greens, ...g });
      expect(r.pushed, name).toBe(false);
      expect(r.blockers.join(' '), name).toMatch(re);
      expect(call(w, 'push'), name).toHaveLength(0);
    }
  });

  it('deadline passed blocks; a non-hex sha never reaches git', () => {
    const w = base();
    expect(pushMerged(deps(w, {}, new Date(START + 7 * 3_600_000)), M, START, greens).blockers.join(' ')).toMatch(/hard stop/);
    const w2 = base();
    expect(pushMerged(deps(w2), 'main', START, greens).blockers.join(' ')).toMatch(/not full hex/);
    expect(w2.calls).toHaveLength(0);
  });

  it('a rejected push is reported as already on origin when origin now has M, else as failed', () => {
    const w = base();
    w.origin = { pushCode: 1 };
    const d = deps(w);
    const r1 = pushMerged(d, M, START, greens);
    expect(r1).toMatchObject({ pushed: false, alreadyOnOrigin: false });
    expect(r1.blockers).toEqual(['git push failed (not forced)']);
    const w2 = base();
    w2.origin = { pushCode: 1 };
    let fetches = 0;
    const d2 = deps(w2);
    const inner = d2.run;
    const run: LandDeps['run'] = (c, a, cwd, e, t) => {
      if (a[0] === 'fetch' && ++fetches === 2) w2.anc.add(`${M}>origin/main`);
      return inner(c, a, cwd, e, t);
    };
    expect(pushMerged({ ...d2, run }, M, START, greens)).toMatchObject({ pushed: false, alreadyOnOrigin: true });
  });
});

describe('keepMerged', () => {
  it('creates nightly-fix-merged/<date>, verifies, then deletes the sources; -2 on a second night', () => {
    const w = world();
    const d = deps(w);
    expect(keepMerged(d, M, '2026-11-25', ['nightly-fix/x-merge-1'])).toEqual({ branch: 'nightly-fix-merged/2026-11-25', deleted: ['nightly-fix/x-merge-1'] });
    expect(keepMerged(d, M, '2026-11-25').branch).toBe('nightly-fix-merged/2026-11-25-2');
  });

  it('keeps the sources when the branch cannot be created or does not verify', () => {
    const w = world({ branchCreateFails: true });
    const r = keepMerged(deps(w), M, '2026-11-25', ['src-branch']);
    expect(r.branch).toBeUndefined();
    expect(r.deleted).toEqual([]);
    expect(w.calls.some((c) => c[1] === 'branch' && c[2] === '-D')).toBe(false);
  });
});
