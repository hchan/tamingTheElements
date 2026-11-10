import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { applyTables, DOC_PATH, GENERATORS } from '../../tools/gen/gen-design-tables';
import { CHARACTERS } from '../../src/core/data/characters';

const doc = readFileSync(DOC_PATH, 'utf8');

describe('docs/GAME-DESIGN.md generated tables', () => {
  it('are up to date (run `pnpm docs:gen`)', () => {
    expect(applyTables(doc)).toBe(doc);
  });

  it.each(Object.keys(GENERATORS))('has a %s block', (name) => {
    expect(doc).toContain(`<!-- gen:${name} -->`);
    expect(doc).toContain(`<!-- /gen:${name} -->`);
  });

  it('lists every character and the elemental advantage cycle', () => {
    expect(GENERATORS.characters?.().split('\n')).toHaveLength(CHARACTERS.length + 2);
    expect(GENERATORS.elements?.()).toContain('| fire | 1 | 1.25 | 1 | 0.8 | 1 |');
  });
});
