import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Arcade Versus (FUN-DESIGN WP 11) writes nothing to the save: no XP, capture, objectives or garrison change. The route
// reads the save once (the opt-in check) through the menu's loader; it must never hold a save store or apply a match
// result. The runtime half of the guarantee is in src/game/app/arcade-setup.test.ts (no storage access at all).
const root = resolve(import.meta.dirname, '../..');
const FILES = [
  'src/game/app/arcade-pick.ts',
  'src/game/app/arcade-setup.ts',
  'src/game/app/arcade-versus.ts',
  'src/ui/screens/arcade-versus.ts',
  'src/game/platform/arcade-setting.ts',
];

describe('Arcade Versus holds no save store', () => {
  it.each(FILES)('%s imports no save store, applies no match result and touches no storage', (f) => {
    const src = readFileSync(resolve(root, f), 'utf8');
    expect(src).not.toMatch(/save-store|export-import|applyMatchResult|newGame\(|importJson|store\.save\(/);
    expect(src).not.toMatch(/localStorage|indexedDB|setItem|removeItem/);
  });
});
