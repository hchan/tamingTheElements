import { describe, expect, it } from 'vitest';
import { lintPlan, lintTargets, needsFullLint } from '../../tools/ci/lint-targets';

describe('lint-targets', () => {
  it('keeps only lintable, unique, sorted paths', () => {
    expect(lintTargets(['b.ts', 'a.mjs', 'README.md', 'b.ts', 'x.json', 'c.tsx', 'd.cjs', 'e.js'])).toEqual(['a.mjs', 'b.ts', 'c.tsx', 'd.cjs', 'e.js']);
  });
  it('drops deleted files', () => {
    expect(lintTargets(['a.ts', 'gone.ts'], (p) => p !== 'gone.ts')).toEqual(['a.ts']);
  });
  it('config changes need a full lint', () => {
    for (const p of ['eslint.config.js', 'eslint.config.mjs', 'tsconfig.json', 'tsconfig.node.json', 'tests/tsconfig.json', 'package.json', 'pnpm-lock.yaml'])
      expect(needsFullLint([p, 'a.ts'])).toBe(true);
    expect(needsFullLint(['src/a.ts', 'docs/x.md'])).toBe(false);
  });
  it('plan: undefined on unknown diff or config change, else targets', () => {
    expect(lintPlan(undefined)).toBeUndefined();
    expect(lintPlan(['package.json'])).toBeUndefined();
    expect(lintPlan(['src/a.ts', 'docs/x.md'])).toEqual(['src/a.ts']);
    expect(lintPlan(['docs/x.md'])).toEqual([]);
  });
});
