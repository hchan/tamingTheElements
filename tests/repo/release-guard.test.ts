import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');

const sources = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? sources(p) : p.endsWith('.ts') && !p.endsWith('.test.ts') ? [p] : [];
  });

describe('release switch isolation (roster24 WP-0)', () => {
  it('nothing in src/core/sim or src/core/agents reads the release set, so a release never changes a replay hash', () => {
    for (const dir of ['src/core/sim', 'src/core/agents']) {
      for (const f of sources(resolve(root, dir))) {
        expect(readFileSync(f, 'utf8'), f).not.toMatch(/data\/release|RELEASED_ROSTER24|isReleased\b/);
      }
    }
  });
});
