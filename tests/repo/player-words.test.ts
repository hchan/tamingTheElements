import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Read as text (like the other repo tests): the UI modules need the DOM lib, which the node project does not have.
const root = resolve(import.meta.dirname, '../..');
const read = (f: string): string => readFileSync(resolve(root, f), 'utf8');
const FORBIDDEN = /classic|arcade|ruleset|capture/i;

/** The text from `start` up to the next occurrence of `end`. */
function block(src: string, start: string, end: string): string {
  const i = src.indexOf(start);
  expect(i, `${start} found`).toBeGreaterThanOrEqual(0);
  return src.slice(i, src.indexOf(end, i));
}
const strings = (s: string): string[] => [...s.matchAll(/'([^'\n]*)'/g)].map((m) => m[1] as string);

describe('words a first-time player must not see', () => {
  it('main menu entries: five, none with a forbidden word', () => {
    const items = block(read('src/ui/screens/main-menu.ts'), 'export const MENU_ITEMS', '];');
    const labels = [...items.matchAll(/label: '([^']*)'/g)].map((m) => m[1] as string);
    expect(labels).toEqual(['Play', 'Versus', 'Online', 'Settings', 'Help']);
    expect(labels.filter((l) => FORBIDDEN.test(l))).toEqual([]);
  });

  it('help links', () => {
    const links = block(read('src/ui/screens/help.ts'), 'export const HELP_LINKS', '];');
    expect(strings(links).filter((l) => FORBIDDEN.test(l))).toEqual([]);
  });

  it('route titles', () => {
    const titles = block(read('src/ui/router.ts'), 'const ROUTE_TITLES', '};');
    expect(strings(titles).filter((l) => FORBIDDEN.test(l))).toEqual([]);
  });

  it('key binding labels', () => {
    const labels = block(read('src/game/platform/input/bindings.ts'), 'export const ACTION_LABELS', '};');
    expect(strings(labels).filter((l) => FORBIDDEN.test(l))).toEqual([]);
  });
});
