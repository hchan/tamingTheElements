import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as full from '../../src/core/index';
import * as menu from '../../src/core/menu-index';

const source = readFileSync(new URL('../../src/core/menu-index.ts', import.meta.url), 'utf8');

describe('core menu barrel', () => {
  it('is a subset of the full barrel with identical bindings', () => {
    for (const [name, value] of Object.entries(menu)) expect(full, name).toHaveProperty(name, value);
  });

  it('re-exports no sim, agent, replay or net value (types only), so the menu entry chunk stays sim-free', () => {
    const runtime = source.split('\n').filter((l) => /^export\s+(\*|\{)/.test(l) && !l.startsWith('export type'));
    expect(runtime.filter((l) => /\.\/(sim|agents|replay|net)\/|tester\/cheats/.test(l))).toEqual([]);
  });

  it('keeps the menu entry off the full barrel', () => {
    // main.ts is the menu entry: it and the screens it mounts import core through `@core/menu-index` only.
    expect(readFileSync(new URL('../../src/game/app/main.ts', import.meta.url), 'utf8')).not.toContain("'@core/index'");
  });
});
