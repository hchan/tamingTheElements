import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ALL_ABILITIES } from '../../src/core/data/abilities-all';

const doc = readFileSync('docs/ABILITY-AUDIT.md', 'utf8').toLowerCase();
const idea = readFileSync('ideas/in-progress/ability-audit.md', 'utf8');

describe('docs/ABILITY-AUDIT.md', () => {
  const names = ALL_ABILITIES.map((a) => String(a.id).replace(/-/g, ' '));

  it.each(names)('has a row for ability "%s"', (name) => {
    expect(doc).toContain(name);
  });

  it('has the graphics pass section', () => {
    expect(doc).toContain('## graphics pass');
  });

  it('keeps the idea file in progress', () => {
    expect(idea).toMatch(/^status: in-progress$/m);
  });
});
