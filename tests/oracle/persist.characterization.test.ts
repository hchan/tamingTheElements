import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadLegacy, type LegacyEnv } from '@testing/legacy/load-legacy';

const SAVES = resolve(import.meta.dirname, '../fixtures/legacy/saves');
const UPDATE = process.env['TTE_UPDATE_FIXTURES'] === '1';
const SETTINGS_VALS = {
  "#settings input[name='difficulty']:checked": '1.12',
  "#settings input[name='garrisonSortOrder']:checked": '3',
  "#settings input[name='displaySettings']:checked": '1.6',
};

type Fn = (...args: unknown[]) => unknown;
const call = (env: LegacyEnv, mod: keyof LegacyEnv['globals'], fn: string, ...args: unknown[]) =>
  (env.globals[mod][fn] as Fn).apply(env.globals[mod], args);

/** The raw localStorage string the legacy code wrote, parsed (key order preserved). */
function stored(env: LegacyEnv): unknown {
  const raw = env.dom.localStorage.getItem('Taming the Elements');
  return raw === null ? null : JSON.parse(raw);
}

function check(name: string, actual: unknown): void {
  const path = resolve(SAVES, `v0-${name}.json`);
  const json = JSON.stringify(actual, null, 2) + '\n';
  if (UPDATE) writeFileSync(path, json);
  expect(existsSync(path), `v0-${name}.json missing: run with TTE_UPDATE_FIXTURES=1`).toBe(true);
  // Compare the text too: key order is part of the save format.
  expect(json).toBe(readFileSync(path, 'utf8'));
}

const fresh = (opts: Parameters<typeof loadLegacy>[0] = {}): LegacyEnv =>
  loadLegacy({ seed: 1, ...opts });

describe('legacy persistence characterization', () => {
  it('empty: no save yields the chapter-0 default state', () => {
    const env = fresh();
    check('empty', { stored: stored(env), state: call(env, 'GamePersist', 'getGameState') });
  });

  it('new-game: saveStart', () => {
    const env = fresh();
    call(env, 'GamePersist', 'saveStart');
    check('new-game', stored(env));
  });

  it('settings-strings: Settings.save stores the jQuery .val() strings untouched', () => {
    const env = fresh({ jquery: { vals: SETTINGS_VALS } });
    call(env, 'GamePersist', 'saveStart');
    env.clock.now += 5000;
    call(env, 'Settings', 'save');
    const state = stored(env) as Record<string, unknown>;
    expect(state['difficulty']).toBe('1.12');
    expect(state['garrisonSortOrder']).toBe('3');
    expect(state['displaySettings']).toBe('1.6');
    check('settings-strings', state);
  });

  it.each([
    ['ch2', 'chapter2'],
    ['ch3', 'chapter3'],
    ['ch4', 'chapter4'],
  ])('%s: GameMaster.%s', (file, fn) => {
    const env = fresh();
    call(env, 'GameMaster', fn);
    check(file, stored(env));
  });

  it('complete: chapterComplete then completeGame', () => {
    const env = fresh();
    call(env, 'GameMaster', 'chapterComplete');
    expect(call(env, 'GamePersist', 'isCompleteGame')).toBe(false);
    env.clock.now += 60_000;
    call(env, 'GamePersist', 'completeGame');
    expect(call(env, 'GamePersist', 'isCompleteGame')).toBe(true);
    check('complete', stored(env));
  });

  it('with-params: updateParams appends params and bumps lastModifiedTime', () => {
    const env = fresh();
    call(env, 'GamePersist', 'saveStart');
    env.clock.now += 1000;
    const params = env.run(
      `({ heroes: [{ id: 'h1', experience: 1, characterName: 'Cyclonius' }],
          opponents: [{ id: 'h1opponent', experience: 1, characterName: 'Pax' }], practice: true })`,
    );
    call(env, 'GamePersist', 'updateParams', params);
    check('with-params', stored(env));
  });

  it('is deterministic for a given seed', () => {
    const a = fresh();
    const b = fresh();
    call(a, 'GamePersist', 'saveStart');
    call(b, 'GamePersist', 'saveStart');
    expect(stored(a)).toEqual(stored(b));
  });
});
