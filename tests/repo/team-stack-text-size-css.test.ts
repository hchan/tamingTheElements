import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(import.meta.dirname, '../../src/ui/styles/team-stack.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

function block(selector: string): string {
  const m = new RegExp(`\\.teamStack ${selector.replace('.', '\\.')}\\s*\\{([^}]*)\\}`).exec(css);
  expect(m, `${selector} rule`).not.toBeNull();
  return m?.[1] ?? '';
}

describe('World Tour team stack text stays at least 14 px on desktop (picker QA: 10-12 px role/stats/tag/remove)', () => {
  for (const sel of ['.tsRole', '.tsStats', '.tsTag', '.tsRemove']) {
    it(`${sel} uses a max(14px, ...) font size`, () => {
      expect(block(sel)).toMatch(/font-size:\s*max\(14px,\s*[\d.]+em\)/);
    });
  }
  it('.tsStats keeps nowrap + ellipsis so the longer text cannot overflow the stack', () => {
    const b = block('.tsStats');
    expect(b).toMatch(/white-space:\s*nowrap/);
    expect(b).toMatch(/text-overflow:\s*ellipsis/);
  });
});
