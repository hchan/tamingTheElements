import { describe, expect, it } from 'vitest';
import { DIFFICULTY, DISPLAY_SCALE, GARRISON_SORT_ORDER } from '../../data/settings';
import { newEmptyState } from '../v1';
import { migrateV0ToV1 } from './v0-to-v1';

describe('migrateV0ToV1', () => {
  it('an empty v0 gives the empty v1 state', () => {
    expect(migrateV0ToV1({})).toEqual(newEmptyState());
  });

  it('accepts numeric strings (the legacy game stored form values) and whitelists settings', () => {
    const out = migrateV0ToV1({ chapter: '3', difficulty: '0.85', displaySettings: '1.4', garrisonSortOrder: '2' });
    expect(out).toMatchObject({
      chapter: 3,
      difficulty: DIFFICULTY.Normal,
      displaySettings: DISPLAY_SCALE.Large,
      garrisonSortOrder: GARRISON_SORT_ORDER['Name, Experience, Elemental Type'],
    });
  });

  it('values outside the allowed sets fall back to the defaults rather than being kept', () => {
    const empty = newEmptyState();
    const out = migrateV0ToV1({ chapter: -1, difficulty: 9, displaySettings: '', garrisonSortOrder: 'x' });
    expect(out.chapter).toBe(empty.chapter);
    expect(out.difficulty).toBe(empty.difficulty);
    expect(out.displaySettings).toBe(empty.displaySettings);
    expect(out.garrisonSortOrder).toBe(empty.garrisonSortOrder);
    expect(migrateV0ToV1({ chapter: 1.5 }).chapter).toBe(empty.chapter);
  });

  it('savedAt is the last modified time; times that are not numbers are dropped', () => {
    const out = migrateV0ToV1({ createdTime: '10', lastModifiedTime: 99, completeTime: 'never' });
    expect(out).toMatchObject({ createdTime: 10, lastModifiedTime: 99, savedAt: 99 });
    expect('completeTime' in out).toBe(false);
    expect(migrateV0ToV1({ lastModifiedTime: null }).savedAt).toBe(0);
  });

  it('garrison members are normalised, junk entries dropped and unknown member fields kept', () => {
    const out = migrateV0ToV1({
      garrison: [{ id: 5, experience: '-4', characterName: 'Fiara', params: { a: 1 }, createdTime: 'x' }, null, 'str', [1], { experience: 'NaN' }],
    });
    expect(out.garrison).toEqual([
      { id: '5', experience: 0, characterName: 'Fiara', params: { a: 1 } },
      { id: '', experience: 0, characterName: '' },
    ]);
  });

  it('a non-array garrison becomes empty, unknown top-level fields survive, and the input is not mutated', () => {
    const v0 = { garrison: 'oops', keyBindings: { up: ['KeyI'] }, extra: { n: 1 } };
    const copy = JSON.parse(JSON.stringify(v0)) as unknown;
    const out = migrateV0ToV1(v0);
    expect(out.garrison).toEqual([]);
    expect(out.keyBindings).toEqual({ up: ['KeyI'] });
    expect(out.extra).toEqual({ n: 1 });
    expect(out.schemaVersion).toBe(1);
    expect(v0).toEqual(copy);
  });
});
