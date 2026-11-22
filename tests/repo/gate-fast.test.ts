import { describe, expect, it } from 'vitest';
import { fastLintFiles, parseBase } from '../../tools/ci/gate-fast';

describe('gate:fast', () => {
  const all = (): boolean => true;
  it('lints only existing source files', () => {
    expect(fastLintFiles(['a.ts', 'b.md', 'gone.ts'], (p) => p !== 'gone.ts')).toEqual(['a.ts']);
  });
  it('a config change lints everything', () => {
    expect(fastLintFiles(['a.ts', 'tsconfig.json'], all)).toBeUndefined();
  });
  it('base defaults to HEAD~1 and honours --base', () => {
    expect(parseBase([])).toBe('HEAD~1');
    expect(parseBase(['--base', 'main'])).toBe('main');
  });
});
