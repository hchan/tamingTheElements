import { describe, expect, it } from 'vitest';
import { isActive, isPrunable, parseArgs, parseWorktreeList } from '../../tools/dev/worktree-prune';

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
    expect(parseArgs([])).toEqual({ apply: false, minAge: 30 });
    expect(parseArgs(['--apply', '--min-age', '5'])).toEqual({ apply: true, minAge: 5 });
    expect(() => parseArgs(['--min-age', 'x'])).toThrow(/min-age/);
    expect(() => parseArgs(['--force'])).toThrow(/Unknown argument/);
  });

  describe('isActive', () => {
    const now = 10_000_000_000;
    const min = 60_000;
    it('flags a fresh empty-branch worktree, not an old merged one', () => {
      expect(isActive({ fsMtimeMs: null, reflogMs: now - 2 * min, ahead: 0 }, now, 30)).toBe(true);
      expect(isActive({ fsMtimeMs: now - 300 * min, reflogMs: now - 300 * min, ahead: 0 }, now, 30)).toBe(false);
    });
    it('flags recently modified dirs even with commits, not old ones', () => {
      expect(isActive({ fsMtimeMs: now - 5 * min, reflogMs: now - 300 * min, ahead: 0 }, now, 30)).toBe(true);
      expect(isActive({ fsMtimeMs: now - 5 * min, reflogMs: null, ahead: 4 }, now, 30)).toBe(true);
      expect(isActive({ fsMtimeMs: now - 31 * min, reflogMs: now - 31 * min, ahead: 4 }, now, 30)).toBe(false);
    });
    it('honours --min-age and unknown facts', () => {
      expect(isActive({ fsMtimeMs: now - 31 * min, reflogMs: null, ahead: 0 }, now, 60)).toBe(true);
      expect(isActive({ fsMtimeMs: null, reflogMs: null, ahead: 0 }, now, 30)).toBe(false);
    });
  });
});
