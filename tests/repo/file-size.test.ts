import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Size rule for the presentation layers (src/ui, src/game): a non-test .ts file stays within LIMIT physical lines
// (wc -l). Files already over it are grandfathered at their size in tools/ci/size-grandfather.json:
//  - growth fails; raising a cap needs a stated reason in the commit (like a golden re-record);
//  - a file that dropped to LIMIT or less is stale: remove its entry;
//  - a file that shrank more than SLACK lines below its cap fails until the cap is lowered, so space won by a split
//    cannot be quietly refilled.
// `longFunctionFiles` feeds the ESLint max-lines-per-function (120) rule: those files are exempt; the count is pinned
// here and only goes down (delete an entry when its last long function is split).
const root = resolve(import.meta.dirname, '../..');
const LIMIT = 500;
const SLACK = 40;
const MAX_LONG_FUNCTION_FILES = 32;

interface Grandfather {
  fileLines: Record<string, number>;
  longFunctionFiles: string[];
}

const grandfather = JSON.parse(
  readFileSync(resolve(root, 'tools/ci/size-grandfather.json'), 'utf8'),
) as Grandfather;

function lineCount(file: string): number {
  const text = readFileSync(resolve(root, file), 'utf8');
  return text === '' ? 0 : text.split('\n').length - (text.endsWith('\n') ? 1 : 0);
}

const files = execFileSync('git', ['ls-files', 'src/ui', 'src/game'], {
  cwd: root,
  encoding: 'utf8',
})
  .split('\n')
  .filter((f) => f.endsWith('.ts') && !/\.(test|spec)\.ts$/.test(f) && !f.endsWith('.d.ts'));

describe('size rule: src/ui and src/game', () => {
  it('finds the source files', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it.each(files)('%s is within its size cap', (f) => {
    const n = lineCount(f);
    const cap = grandfather.fileLines[f];
    if (cap === undefined) {
      expect(
        n,
        `${f} is ${String(n)} lines; split it (limit ${String(LIMIT)}) instead of growing it`,
      ).toBeLessThanOrEqual(LIMIT);
      return;
    }
    expect(
      n,
      `${f} grew past its grandfathered cap ${String(cap)}; split it, do not grow it`,
    ).toBeLessThanOrEqual(cap);
    expect(
      n,
      `${f} is ${String(n)} lines (<= ${String(LIMIT)}): remove it from fileLines in tools/ci/size-grandfather.json`,
    ).toBeGreaterThan(LIMIT);
    expect(
      cap - n,
      `${f} shrank: lower its cap to ${String(n)} in tools/ci/size-grandfather.json`,
    ).toBeLessThanOrEqual(SLACK);
  });

  it('every grandfathered path exists and is a checked file', () => {
    for (const f of Object.keys(grandfather.fileLines)) expect(files, f).toContain(f);
    for (const f of grandfather.longFunctionFiles) expect(files, f).toContain(f);
  });

  it('pins the long-function grandfather list (only goes down)', () => {
    expect(grandfather.longFunctionFiles.length).toBeLessThanOrEqual(MAX_LONG_FUNCTION_FILES);
    expect(new Set(grandfather.longFunctionFiles).size).toBe(grandfather.longFunctionFiles.length);
  });
});
