import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// idle-look.ts is read by the menu (src/ui) as well as the arena view: every import must be type-only so the menu chunk
// gets no core runtime from it.
describe('idle-look.ts', () => {
  it('adds no core runtime: every import is type-only', () => {
    const src = readFileSync(resolve(import.meta.dirname, '../../src/game/platform/idle-look.ts'), 'utf8');
    const imports = src.split('\n').filter((l) => /^import\b/.test(l));
    expect(imports.length).toBeGreaterThan(0);
    for (const l of imports) expect(l).toMatch(/^import type\b/);
  });
});
