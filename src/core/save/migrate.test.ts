import { describe, expect, it } from 'vitest';
import { Sfc32 } from '../rng/sfc32';
import { migrate } from './migrate';
import { validateV1 } from './schema';
import { newEmptyState } from './v1';
import v0_ch2 from '@fixtures/legacy/saves/v0-ch2.json';
import v0_ch3 from '@fixtures/legacy/saves/v0-ch3.json';
import v0_ch4 from '@fixtures/legacy/saves/v0-ch4.json';
import v0_complete from '@fixtures/legacy/saves/v0-complete.json';
import v0_empty from '@fixtures/legacy/saves/v0-empty.json';
import v0_new_game from '@fixtures/legacy/saves/v0-new-game.json';
import v0_settings_strings from '@fixtures/legacy/saves/v0-settings-strings.json';
import v0_with_params from '@fixtures/legacy/saves/v0-with-params.json';

const files: Record<string, unknown> = {
  'v0-ch2': v0_ch2,
  'v0-ch3': v0_ch3,
  'v0-ch4': v0_ch4,
  'v0-complete': v0_complete,
  'v0-empty': v0_empty,
  'v0-new-game': v0_new_game,
  'v0-settings-strings': v0_settings_strings,
  'v0-with-params': v0_with_params,
};

const fixture = (name: string): unknown => files[name];

/** v0-empty.json wraps the stored value (null) next to the expected state. */
function unwrap(x: unknown): unknown {
  return typeof x === 'object' && x !== null && 'stored' in x ? (x).stored : x;
}

describe('save migration', () => {
  it('finds all v0 fixtures', () => {
    expect(Object.keys(files).length).toBe(8);
  });

  for (const [path, raw] of Object.entries(files)) {
    it(`migrates ${path} and round-trips`, () => {
      const r = migrate(unwrap(raw));
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.value.schemaVersion).toBe(1);
      expect(validateV1(r.value).ok).toBe(true);
      expect(migrate(r.value)).toEqual(r);
      expect(migrate(JSON.parse(JSON.stringify(r.value)))).toEqual(r);
    });
  }

  it('empty fixture matches its expected state', () => {
    const r = migrate(unwrap(fixture('v0-empty')));
    expect(r.ok && r.value).toMatchObject({ chapter: 0, displaySettings: 1.25 });
  });

  it('normalises numeric strings and preserves unknown fields', () => {
    const r = migrate({ ...(fixture('v0-settings-strings') as object), extra: 7 });
    expect(r.ok && r.value).toMatchObject({
      garrisonSortOrder: 3,
      difficulty: 1.12,
      displaySettings: 1.6,
      savedAt: 1577836805000,
      extra: 7,
    });
  });

  it('keeps params from legacy saves', () => {
    const r = migrate(fixture('v0-with-params'));
    expect(r.ok && r.value.params).toBeDefined();
  });

  it('null and garbage give the empty state', () => {
    for (const g of [null, undefined, 5, 'x', [], true]) {
      expect(migrate(g)).toEqual({ ok: true, value: newEmptyState() });
    }
  });

  it('rejects a future version with a typed error', () => {
    expect(migrate({ schemaVersion: 2 })).toEqual({ ok: false, error: { kind: 'future-version', version: 2 } });
  });

  it('rejects an invalid v1', () => {
    expect(migrate({ schemaVersion: 1, chapter: 'x' }).ok).toBe(false);
  });

  it('never throws on random v0-like objects and is idempotent', () => {
    const rng = new Sfc32([1, 2, 3, 4]);
    const junkValues: unknown[] = [
      null, undefined, NaN, Infinity, -1, 0, 1, 1.25, '', ' ', '3', 'abc', true, [], {}, [{}], [null, 1], { id: 1 }, 1e308,
    ];
    const junk = (): unknown => rng.pick(junkValues);
    const keys = [
      'chapter', 'garrisonSortOrder', 'difficulty', 'displaySettings', 'garrison',
      'createdTime', 'lastModifiedTime', 'completeTime', 'params', 'zzz',
    ];
    for (let i = 0; i < 500; i++) {
      const o: Record<string, unknown> = {};
      for (const k of keys) if (rng.int(2) === 0) o[k] = junk();
      if (rng.int(3) === 0) {
        o.garrison = [{ id: junk(), experience: junk(), characterName: junk(), createdTime: junk() }];
      }
      const r = migrate(o);
      expect(r.ok).toBe(true);
      expect(migrate(r.ok ? r.value : null)).toEqual(r);
    }
  });
});
