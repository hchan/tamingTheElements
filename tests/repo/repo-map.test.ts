import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');
const repoMap = readFileSync(resolve(root, 'docs/REPO-MAP.md'), 'utf8');

const topLevelDirs = [
  ...new Set(
    execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' })
      .split('\n')
      .filter((f) => f.includes('/'))
      .map((f) => f.slice(0, f.indexOf('/'))),
  ),
];
const srcDirs = readdirSync(resolve(root, 'src')).filter((d) =>
  statSync(resolve(root, 'src', d)).isDirectory(),
);

describe('docs/REPO-MAP.md', () => {
  it.each(topLevelDirs)('mentions top-level dir %s', (dir) => {
    expect(repoMap).toContain(`\`${dir}/`);
  });

  it.each(srcDirs)('mentions src dir %s', (dir) => {
    expect(repoMap).toContain(`src/${dir}/`);
  });

  it('only names backticked directories that exist', () => {
    const missing = [...repoMap.matchAll(/`([^`\s]+\/)`/g)]
      .map((m) => m[1] as string)
      .filter((p) => !p.startsWith('http') && !p.includes('*') && !p.includes('<'))
      .filter((p) => !existsSync(resolve(root, p)));
    expect(missing).toEqual([]);
  });
});
