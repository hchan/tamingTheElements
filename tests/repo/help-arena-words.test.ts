import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ARENA_NOTES, ARENA_PATCHES } from '../../src/ui/screens/help-guide';

// Help copy duplicates the floor-patch and badge words (the ui layer cannot import game/fx); this pins them to the real ones.
// The source is read as text: importing terrain-fx would drag DOM types into the node-only test project.
const src = readFileSync('src/game/fx/terrain-fx.ts', 'utf8');

function wordsOf(name: string): string[] {
  const m = new RegExp(`export const ${name} = \\[([^\\]]+)\\]`).exec(src);
  if (!m?.[1]) throw new Error(`${name} not found in terrain-fx.ts`);
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1] ?? '');
}

describe('Help "Reading the arena" words', () => {
  it('names every floor patch word, and every buff badge word', () => {
    const patch = wordsOf('PATCH_WORDS');
    const buff = wordsOf('BUFF_WORDS');
    expect(patch).toHaveLength(4);
    expect(buff).toHaveLength(4);
    const patches = ARENA_PATCHES.join(' | ');
    for (const w of patch) expect(patches).toContain(w);
    const notes = ARENA_NOTES.join(' | ');
    for (const w of buff) expect(notes).toContain(w);
  });
});
