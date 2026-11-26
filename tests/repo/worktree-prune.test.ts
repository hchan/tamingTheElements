import { describe, expect, it } from 'vitest';
import { isPrunable, parseArgs, parseWorktreeList } from '../../tools/dev/worktree-prune';

const PORCELAIN = `worktree /r
HEAD aaa
branch refs/heads/main

worktree /r/.claude/worktrees/a
HEAD bbb
branch refs/heads/wt-a

worktree /r/.claude/worktrees/b
HEAD ccc
branch refs/heads/wt-b
locked agent running

worktree /r/.claude/worktrees/c
HEAD ddd
detached
`;

function at(i: number) {
  const e = parseWorktreeList(PORCELAIN)[i];
  if (e === undefined) throw new Error('missing');
  return e;
}

const ok = { merged: true, clean: true };

describe('worktree-prune', () => {
  it('parses porcelain output', () => {
    const l = parseWorktreeList(PORCELAIN);
    expect(l.map((e) => e.branch)).toEqual(['main', 'wt-a', 'wt-b', null]);
    expect(l.map((e) => e.locked)).toEqual([false, false, true, false]);
  });

  it('prunes only merged, clean, unlocked worktrees under .claude/worktrees', () => {
    const [main, a, b, c] = [at(0), at(1), at(2), at(3)];
    expect(isPrunable(a, ok, '/elsewhere')).toBe(true);
    expect(isPrunable(a, { merged: false, clean: true }, '/elsewhere')).toBe(false);
    expect(isPrunable(a, { merged: true, clean: false }, '/elsewhere')).toBe(false);
    expect(isPrunable(b, ok, '/elsewhere')).toBe(false);
    expect(isPrunable(c, ok, '/elsewhere')).toBe(false);
    expect(isPrunable(main, ok, '/elsewhere')).toBe(false);
  });

  it('skips the current cwd and anything inside it', () => {
    const a = at(1);
    expect(isPrunable(a, ok, '/r/.claude/worktrees/a')).toBe(false);
    expect(isPrunable(a, ok, '/r/.claude/worktrees/a/src')).toBe(false);
    expect(isPrunable(a, ok, '/r/.claude/worktrees/ab')).toBe(true);
  });

  it('defaults to dry run', () => {
    expect(parseArgs([])).toEqual({ apply: false });
    expect(parseArgs(['--apply'])).toEqual({ apply: true });
    expect(() => parseArgs(['--force'])).toThrow(/Unknown argument/);
  });
});
