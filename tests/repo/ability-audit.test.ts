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

  it.each(['hoof-crash', 'kelp-lash', 'boulder-roll', 'stinging-filament', 'bell-pulse'])('row for "%s" carries its damage and cooldown', (id) => {
    const def = ALL_ABILITIES.find((a) => String(a.id) === id);
    expect(def, id).toBeDefined();
    const row = doc.split('\n').find((l) => l.startsWith('|') && l.includes(id.replace(/-/g, ' ')));
    expect(row, id).toBeDefined();
    expect(row).toContain(`${String(def?.damage)} dmg`);
    expect(row).toContain(`${String((def?.cooldownMs ?? 0) / 1000)} s cd`);
  });

  it('has the graphics pass section', () => {
    expect(doc).toContain('## graphics pass');
  });

  it('keeps the idea file in progress', () => {
    expect(idea).toMatch(/^status: in-progress$/m);
  });
});
