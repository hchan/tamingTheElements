/**
 * List (default) or remove (--apply) git worktrees under .claude/worktrees whose branch is fully
 * merged into main, whose working tree is clean and that are not locked. Never uses --force.
 * Worktrees touched within --min-age minutes (default 30), or with no own commits and a recent reflog entry, are skipped.
 * `.scratch/` is copied to ~/claudetmp/archive/<name>/ before removal.
 */
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join, resolve } from 'node:path';

export interface WorktreeEntry {
  path: string;
  branch: string | null;
  locked: boolean;
  prunable: boolean;
  bare: boolean;
}

export interface WorktreeFacts {
  merged: boolean;
  clean: boolean;
}

/** Activity facts (epoch ms; null = unknown) used to skip worktrees that look like a running agent's. */
export interface ActivityFacts {
  /** Newest mtime of the worktree dir and its .scratch/. */
  fsMtimeMs: number | null;
  /** Time of the newest HEAD reflog entry. */
  reflogMs: number | null;
  /** Commits on the branch that are not in main. */
  ahead: number;
}

export const DEFAULT_MIN_AGE_MIN = 30;

/** True when the worktree was touched within `minAgeMin`, or has no own commits and a recent reflog entry. */
export function isActive(a: ActivityFacts, nowMs: number, minAgeMin: number): boolean {
  const limit = minAgeMin * 60_000;
  const recent = (t: number | null): boolean => t !== null && nowMs - t < limit;
  if (recent(a.fsMtimeMs)) return true;
  // A fresh builder branch (ahead === 0, reset onto main) looks like a finished one; its reflog gives it away.
  // A recent reflog entry counts for every branch, ahead or not (`ahead` is kept for the report/tests).
  return recent(a.reflogMs);
}

export const WORKTREE_DIR_MARKER = '/.claude/worktrees/';

/** Parse `git worktree list --porcelain` output. */
export function parseWorktreeList(text: string): WorktreeEntry[] {
  const out: WorktreeEntry[] = [];
  for (const block of text.split(/\n\s*\n/)) {
    const lines = block.split('\n').map((l) => l.trimEnd()).filter(Boolean);
    const first = lines[0];
    if (first === undefined || !first.startsWith('worktree ')) continue;
    const e: WorktreeEntry = { path: first.slice('worktree '.length), branch: null, locked: false, prunable: false, bare: false };
    for (const l of lines.slice(1)) {
      if (l.startsWith('branch ')) e.branch = l.slice('branch '.length).replace(/^refs\/heads\//, '');
      else if (l === 'locked' || l.startsWith('locked ')) e.locked = true;
      else if (l === 'prunable' || l.startsWith('prunable ')) e.prunable = true;
      else if (l === 'bare') e.bare = true;
    }
    out.push(e);
  }
  return out;
}

/** True when `e` may be removed: under .claude/worktrees, has a branch, merged, clean, unlocked, not cwd. */
export function isPrunable(e: WorktreeEntry, facts: WorktreeFacts, cwd: string): boolean {
  if (e.bare || e.locked || e.prunable || e.branch === null || e.branch === 'main') return false;
  if (!e.path.includes(WORKTREE_DIR_MARKER)) return false;
  const p = resolve(e.path);
  const c = resolve(cwd);
  if (c === p || c.startsWith(p + '/')) return false;
  return facts.merged && facts.clean;
}

function git(args: string[], cwd?: string): string {
  return execFileSync('git', args, { encoding: 'utf8', cwd, stdio: ['ignore', 'pipe', 'pipe'] });
}

function gatherFacts(e: WorktreeEntry): WorktreeFacts {
  let merged = false;
  try {
    // exit 0 when the branch tip is an ancestor of main
    execFileSync('git', ['merge-base', '--is-ancestor', e.branch ?? '', 'main'], { stdio: 'ignore' });
    merged = true;
  } catch {
    merged = false;
  }
  let clean = false;
  try {
    clean = git(['status', '--porcelain'], e.path).trim() === '';
  } catch {
    clean = false;
  }
  return { merged, clean };
}

function gatherActivity(e: WorktreeEntry): ActivityFacts {
  let fsMtimeMs: number | null = null;
  for (const p of [e.path, join(e.path, '.scratch')]) {
    try {
      fsMtimeMs = Math.max(fsMtimeMs ?? 0, statSync(p).mtimeMs);
    } catch {
      /* missing .scratch */
    }
  }
  let reflogMs: number | null = null;
  try {
    const t = Number(git(['log', '-g', '-1', '--format=%ct', 'HEAD'], e.path).trim());
    if (Number.isFinite(t) && t > 0) reflogMs = t * 1000;
  } catch {
    reflogMs = null;
  }
  let ahead = 0;
  try {
    ahead = Number(git(['rev-list', '--count', `main..${e.branch ?? ''}`]).trim()) || 0;
  } catch {
    ahead = 0;
  }
  return { fsMtimeMs, reflogMs, ahead };
}

export function parseArgs(argv: string[]): { apply: boolean; minAge: number } {
  let apply = false;
  let minAge = DEFAULT_MIN_AGE_MIN;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') apply = true;
    else if (a === '--min-age') {
      const v = Number(argv[++i]);
      if (!Number.isFinite(v) || v < 0) throw new Error('--min-age needs a number of minutes >= 0');
      minAge = v;
    } else throw new Error(`Unknown argument: ${a}`);
  }
  return { apply, minAge };
}

function main(): void {
  const { apply, minAge } = parseArgs(process.argv.slice(2));
  const cwd = process.cwd();
  const list = parseWorktreeList(git(['worktree', 'list', '--porcelain']));
  const now = Date.now();
  let skippedActive = 0;
  const targets = list.filter((e) => {
    if (!e.path.includes(WORKTREE_DIR_MARKER) || !isPrunable(e, gatherFacts(e), cwd)) return false;
    if (isActive(gatherActivity(e), now, minAge)) {
      skippedActive++;
      return false;
    }
    return true;
  });
  for (const e of targets) console.log(`${apply ? 'remove' : 'would remove'}: ${e.path} [${e.branch}]`);
  console.log(`${skippedActive} skipped as active (touched within ${minAge} min)`);
  console.log(`${targets.length} prunable worktree(s)${apply ? '' : ' (dry run; pass --apply to remove)'}`);
  if (!apply) return;
  for (const e of targets) {
    const scratch = join(e.path, '.scratch');
    if (existsSync(scratch)) {
      const dest = join(homedir(), 'claudetmp', 'archive', basename(e.path));
      mkdirSync(dest, { recursive: true });
      cpSync(scratch, dest, { recursive: true });
    }
    git(['worktree', 'remove', e.path]);
  }
}

if (process.argv[1] !== undefined && /worktree-prune\.ts$/.test(process.argv[1])) main();
