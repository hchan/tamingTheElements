import { describe, expect, it } from 'vitest';
import { fastLintFiles, parseBase, repoNeedsFull } from '../../tools/ci/gate-fast';

describe('gate:fast', () => {
  const all = (): boolean => true;
  it('lints only existing source files', () => {
    expect(fastLintFiles(['a.ts', 'b.md', 'gone.ts'], (p) => p !== 'gone.ts')).toEqual(['a.ts']);
  });
  it('a config change lints everything', () => {
    expect(fastLintFiles(['a.ts', 'tsconfig.json'], all)).toBeUndefined();
  });
  it('a change outside src/ runs the whole repo project (pin tests that --changed misses)', () => {
    expect(repoNeedsFull(['src/core/a.ts'])).toBe(false);
    expect(repoNeedsFull(['src/core/a.ts', 'docs/REPO-MAP.md'])).toBe(true);
    expect(repoNeedsFull(['tools/ci/gate.ts'])).toBe(true);
  });
  it('base defaults to HEAD~1 and honours --base', () => {
    expect(parseBase([])).toBe('HEAD~1');
    expect(parseBase(['--base', 'main'])).toBe('main');
  });
});
