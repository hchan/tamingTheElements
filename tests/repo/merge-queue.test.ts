import { describe, expect, it } from 'vitest';
import { loadVerdict } from '../../tools/ci/load-check';
import { classifyConflicts, gateOnMain, mergeMessage, parseArgs, resolveAdditive } from '../../tools/ci/merge-queue';

const hunk = (base: string, ours: string, theirs: string): string =>
  ['a', '<<<<<<< HEAD', ...ours.split('\n').filter(Boolean), '||||||| base', ...base.split('\n').filter(Boolean), '=======', ...theirs.split('\n').filter(Boolean), '>>>>>>> br', 'z'].join('\n');

describe('merge:queue', () => {
  it('sees a gate on main but ignores worktree gates', () => {
    expect(gateOnMain('12 node tsx tools/ci/gate.ts commit')).toBe(true);
    expect(gateOnMain('12 node /x/.claude/worktrees/a/tools/ci/gate.ts commit')).toBe(false);
    expect(gateOnMain('')).toBe(false);
  });
  it('builds the merge message with the trailer', () => {
    expect(mergeMessage('x (wp)')).toBe('Merge x (wp)\n\nCo-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>');
  });
  it('keeps both sides of an additive hunk', () => {
    expect(resolveAdditive(hunk('', 'O\n', 'T\n'))).toBe('a\nO\nT\nz');
    expect(resolveAdditive(hunk('B\n', 'B\nO\n', 'B\nT\n'))).toBe('a\nB\nO\nT\nz');
  });
  it('refuses a hunk where a side edits the base', () => {
    expect(resolveAdditive(hunk('B\n', 'X\n', 'B\nT\n'))).toBeUndefined();
    expect(resolveAdditive('<<<<<<< HEAD\nx\n=======\ny\n>>>>>>> b')).toBeUndefined();
  });
  it('classifies conflicted files', () => {
    expect(classifyConflicts(['docs/REPO-MAP.md', 'src/a.ts'])).toEqual({ auto: ['docs/REPO-MAP.md'], hard: ['src/a.ts'] });
  });
  it('parses args', () => {
    expect(parseArgs(['--cleanup', 'b', 's'])).toMatchObject({ branch: 'b', subject: 's', cleanup: true });
    expect(parseArgs(['b'])).toBeUndefined();
  });
});

describe('load:check', () => {
  it('compares load with the cap', () => {
    expect(loadVerdict(14, [], 14).ok).toBe(true);
    expect(loadVerdict(14.1, [], 14).ok).toBe(false);
    expect(loadVerdict(5, ['--cap', '4'], 14)).toEqual({ load: 5, cap: 4, ok: false });
    expect(loadVerdict(1, [], 0).cap).toBe(14);
  });
});
