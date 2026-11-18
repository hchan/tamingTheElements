/**
 * Source for a PC e2e job: either a commit that is already on origin/main (sha only), or a snapshot of the worktree
 * (tracked changes AND untracked, non-ignored files) turned into a git bundle. The snapshot is built from a
 * temporary index, so HEAD, the real index and the working tree are never touched. The bundle holds only the
 * commits origin/main lacks plus the snapshot commit; it goes to the LAN PC clone, never to origin.
 * Used by tools/ci/pc-remote.ts and the e2e router (see docs/TESTING.md "The GPU PC"). No host names live here.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { JOB_ID_RE } from './pc-job';

export const DEFAULT_MAX_BYTES = 200 * 1024 * 1024;

export interface PlanOptions {
  /** Ignored paths (relative to cwd) to force-add to the snapshot. */
  include?: readonly string[];
  /** Bundle size cap in bytes (default 200 MB). */
  maxBytes?: number;
  /** Where the bundle is written (default <cwd>/.scratch/remote-e2e/<id>). */
  outDir?: string;
}

export interface SourcePlan {
  /** Commit to check out on the PC. */
  sha: string;
  /** Absolute path of the bundle (snapshot mode only). */
  bundle?: string;
  /** Ref inside the bundle that points at `sha` (snapshot mode only). */
  ref?: string;
  /** Bundle size in bytes; 0 in sha mode. */
  bytes: number;
  sha256?: string;
}

function git(cwd: string, args: readonly string[], env: NodeJS.ProcessEnv = {}): string {
  return execFileSync('git', [...args], {
    cwd,
    env: { ...process.env, ...env },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 64 * 1024 * 1024,
  });
}

function gitOk(cwd: string, args: readonly string[]): boolean {
  try {
    git(cwd, args);
    return true;
  } catch {
    return false;
  }
}

/** The biggest untracked, non-ignored files, for the "too big" message. */
export function biggestUntracked(cwd: string, n = 5): { path: string; bytes: number }[] {
  const files = git(cwd, ['ls-files', '-o', '--exclude-standard', '-z']).split('\0').filter(Boolean);
  const sized = files.flatMap((p) => {
    try {
      return [{ path: p, bytes: statSync(join(cwd, p)).size }];
    } catch {
      return [];
    }
  });
  return sized.sort((a, b) => b.bytes - a.bytes).slice(0, n);
}

export function planSource(cwdIn: string, id: string, opts: PlanOptions = {}): SourcePlan {
  if (!JOB_ID_RE.test(id)) throw new Error(`bad job id: ${id}`);
  const cwd = resolve(cwdIn);
  const include = opts.include ?? [];
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
  const head = git(cwd, ['rev-parse', 'HEAD']).trim();
  const hasOrigin = gitOk(cwd, ['rev-parse', '--verify', '-q', 'origin/main']);
  const clean = git(cwd, ['status', '--porcelain', '--', '.', ':(exclude).scratch']).trim() === '';
  if (clean && include.length === 0 && hasOrigin && gitOk(cwd, ['merge-base', '--is-ancestor', 'HEAD', 'origin/main'])) {
    return { sha: head, bytes: 0 };
  }

  const gitDir = resolve(cwd, git(cwd, ['rev-parse', '--git-dir']).trim());
  const index = join(gitDir, `tte-snap-${id}.index`);
  const ref = `refs/tte-remote/${id}`;
  const outDir = resolve(opts.outDir ?? join(cwd, '.scratch', 'remote-e2e', id));
  const bundle = join(outDir, 'src.bundle');
  mkdirSync(outDir, { recursive: true });
  const env = {
    GIT_INDEX_FILE: index,
    GIT_AUTHOR_NAME: 'tte-remote',
    GIT_AUTHOR_EMAIL: 'tte-remote@localhost',
    GIT_COMMITTER_NAME: 'tte-remote',
    GIT_COMMITTER_EMAIL: 'tte-remote@localhost',
  };
  let refMade = false;
  try {
    git(cwd, ['read-tree', 'HEAD'], env);
    git(cwd, ['add', '-A', '--', '.'], env);
    git(cwd, ['rm', '-r', '-q', '--cached', '--ignore-unmatch', '--', '.scratch'], env);
    if (include.length > 0) git(cwd, ['add', '-A', '-f', '--', ...include], env);
    const tree = git(cwd, ['write-tree'], env).trim();
    const commit = git(cwd, ['commit-tree', tree, '-p', 'HEAD', '-m', `tte-remote snapshot ${id}`], env).trim();
    git(cwd, ['update-ref', ref, commit]);
    refMade = true;
    git(cwd, ['bundle', 'create', bundle, ref, ...(hasOrigin ? ['^origin/main'] : [])]);
    const bytes = statSync(bundle).size;
    if (bytes > maxBytes) {
      rmSync(bundle, { force: true });
      const big = biggestUntracked(cwd).map((f) => `  ${f.bytes} ${f.path}`).join('\n');
      throw new Error(`snapshot bundle is ${bytes} bytes, over the ${maxBytes} cap. Biggest untracked files:\n${big || '  (none)'}`);
    }
    const sha256 = createHash('sha256').update(readFileSync(bundle)).digest('hex');
    return { sha: commit, bundle, ref, bytes, sha256 };
  } finally {
    if (refMade) gitOk(cwd, ['update-ref', '-d', ref]);
    rmSync(index, { force: true });
  }
}
