import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadLegacy } from '@testing/legacy/load-legacy';

const FIXTURES = resolve(import.meta.dirname, '../fixtures/legacy');
const UPDATE = process.env['TTE_UPDATE_FIXTURES'] === '1';

type Obj = Record<string, unknown>;

/** Exact Float64 bits as hex. */
function bits(n: number): string {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, n);
  return view.getBigUint64(0).toString(16).padStart(16, '0');
}

/** Plain-data copy: functions dropped, non-integer numbers stored as { n, bits }. */
function plain(value: unknown): unknown {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return String(value);
    return Number.isInteger(value) ? value : { n: value, bits: bits(value) };
  }
  if (Array.isArray(value)) return value.map(plain);
  if (value !== null && typeof value === 'object') {
    const out: Obj = {};
    for (const [k, v] of Object.entries(value as Obj)) {
      if (typeof v !== 'function') out[k] = plain(v);
    }
    return out;
  }
  return value;
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Obj)
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([k, v]) => [k, sortKeys(v)]),
    );
  }
  return value;
}

function check(file: string, actual: unknown): void {
  const path = resolve(FIXTURES, file);
  const json = JSON.stringify(sortKeys(actual), null, 2) + '\n';
  if (UPDATE) writeFileSync(path, json);
  expect(existsSync(path), `${file} missing: run with TTE_UPDATE_FIXTURES=1`).toBe(true);
  expect(JSON.parse(json)).toEqual(JSON.parse(readFileSync(path, 'utf8')));
}

const env = loadLegacy({ seed: 1 });
const { GameHelper, Settings, Garrison, Game, Global } = env.globals;
type Entry = { name: string; component: Obj & { defaults: Obj } };
const characters = GameHelper['characters'] as Record<string, Entry>;
const abilities = GameHelper['abilities'] as Record<string, Entry>;

/** Own non-function props of a component other than `defaults` (speedIncrease, heal, ...). */
function extras(component: Obj): Obj {
  const out: Obj = {};
  for (const [k, v] of Object.entries(component)) {
    if (k !== 'defaults' && typeof v !== 'function') out[k] = v;
  }
  return out;
}

function scalars(obj: Obj): Obj {
  const out: Obj = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || ['number', 'string', 'boolean'].includes(typeof v)) out[k] = v;
  }
  return out;
}

function withoutDescription(entry: Entry): Obj {
  const defaults = { ...entry.component.defaults };
  delete defaults['description'];
  return { defaults, extras: extras(entry.component) };
}

describe('legacy data characterization', () => {
  it('matches data.json', () => {
    const list = GameHelper['charactersArray'] as Entry[];
    const data = {
      characters: Object.fromEntries(
        Object.entries(characters).map(([name, c]) => [name, withoutDescription(c)]),
      ),
      abilities: Object.fromEntries(
        Object.entries(abilities).map(([name, a]) => [name, withoutDescription(a)]),
      ),
      settings: {
        difficultyEnum: (Settings['difficultyEnum'] as () => Obj).call(Settings),
        garrisonSortOrderEnum: (Settings['garrisonSortOrderEnum'] as () => Obj).call(Settings),
        displaySettingsEnum: (Settings['displaySettingsEnum'] as () => Obj).call(Settings),
        scalars: scalars(Settings),
      },
      garrison: { MaxXP: Garrison['MaxXP'], MAX_SIZE: Garrison['MAX_SIZE'] },
      game: scalars(Game),
      global: scalars(Global),
      charactersArray: list.map((c) => c.name),
      charactersArrayIncludesBossOrDummy: list.some(
        (c) => c.name === Game['lastBoss'] || c.name === Game['dummyTarget'],
      ),
      elementalCharactersByType: Object.fromEntries(
        Object.entries(GameHelper['elementalCharactersByType'] as Record<string, Entry[]>).map(
          ([type, members]) => [type, members.map((c) => c.name)],
        ),
      ),
    };
    check('data.json', plain(data));
  });

  it('matches text.json', () => {
    const text = {
      characters: Object.fromEntries(
        Object.entries(characters).map(([n, c]) => [n, c.component.defaults['description']]),
      ),
      abilities: Object.fromEntries(
        Object.entries(abilities).map(([n, a]) => [n, a.component.defaults['description'] ?? null]),
      ),
    };
    check('text.json', text);
  });

  it('keeps the boss and dummy out of the selectable list', () => {
    expect((GameHelper['charactersArray'] as unknown[]).length).toBe(12);
    expect(Object.keys(characters)).toContain(Game['lastBoss']);
    expect(Object.keys(characters)).toContain(Game['dummyTarget']);
  });
});
