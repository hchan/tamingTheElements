import { describe, expect, it } from 'vitest';
import { GLOBAL_NAMES, legacyScriptPaths, loadLegacy } from '@testing/legacy/load-legacy';

describe('legacy loader', () => {
  const env = loadLegacy({ seed: 1 });
  const { GameHelper } = env.globals;

  it('loads the 24 scripts of index.html in order, skipping vendored libs', () => {
    const paths = legacyScriptPaths();
    expect(paths).toHaveLength(24);
    expect(paths[0]).toBe('src/input.js');
    expect(paths.at(-1)).toBe('src/main.js');
  });

  it('exposes the legacy modules', () => {
    for (const name of GLOBAL_NAMES) expect(env.globals[name], name).toBeTypeOf('object');
  });

  it('registers 12 races, the boss and the dummy', () => {
    const characters = Object.keys(GameHelper['characters'] as object);
    expect(characters).toHaveLength(14);
    expect(GameHelper['charactersArray'] as unknown[]).toHaveLength(12);
  });

  it('registers 30 abilities', () => {
    expect(Object.keys(GameHelper['abilities'] as object)).toHaveLength(30);
  });

  it('uses the fake clock and seeded random', () => {
    expect(env.run('new Date().getTime()')).toBe(env.clock.now);
    const a = env.run('Math.random()');
    expect(a).toBe(loadLegacy({ seed: 1 }).run('Math.random()'));
  });
});
