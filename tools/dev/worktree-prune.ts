/**
 * List (default) or remove (--apply) git worktrees under .claude/worktrees whose branch is fully
 * merged into main, whose working tree is clean and that are not locked. Never uses --force.
 * `.scratch/` is copied to ~/claudetmp/archive/<name>/ before removal.
 */
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync } from 'node:fs';
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

export function parseArgs(argv: string[]): { apply: boolean } {
  let apply = false;
  for (const a of argv) {
    if (a === '--apply') apply = true;
    else throw new Error(`Unknown argument: ${a}`);
  }
  return { apply };
}

function main(): void {
  const { apply } = parseArgs(process.argv.slice(2));
  const cwd = process.cwd();
  const list = parseWorktreeList(git(['worktree', 'list', '--porcelain']));
  const targets = list.filter((e) => e.path.includes(WORKTREE_DIR_MARKER) && isPrunable(e, gatherFacts(e), cwd));
  for (const e of targets) console.log(`${apply ? 'remove' : 'would remove'}: ${e.path} [${e.branch}]`);
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
