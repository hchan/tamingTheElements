import { describe, expect, it } from 'vitest';
import { migrate, newEmptyState } from '@core/index';
import { applyPrefsToSave, getPrefs, readOsPrefs, resolvePrefs, savedPrefs, setSavedPrefs } from './prefs';

const calm = { reduceMotion: false, highContrast: false };
const reduced = { reduceMotion: true, highContrast: false };

describe('savedPrefs', () => {
  it('is empty for a save without the fields', () => {
    expect(savedPrefs(newEmptyState())).toEqual({});
    expect(savedPrefs(null)).toEqual({});
  });
  it('ignores non-boolean values', () => {
    expect(savedPrefs({ reduceMotion: 'yes', highContrast: 1 })).toEqual({});
    expect(savedPrefs({ reduceMotion: false, highContrast: true })).toEqual({ reduceMotion: false, highContrast: true });
  });
});

describe('resolvePrefs', () => {
  it('follows the OS by default', () => {
    expect(resolvePrefs({}, reduced)).toEqual({ reduceMotion: true, highContrast: false });
    expect(resolvePrefs({}, calm)).toEqual({ reduceMotion: false, highContrast: false });
  });
  it('an explicit choice beats the OS in both directions', () => {
    expect(resolvePrefs({ reduceMotion: false }, reduced).reduceMotion).toBe(false);
    expect(resolvePrefs({ reduceMotion: true }, calm).reduceMotion).toBe(true);
  });
});

describe('applyPrefsToSave', () => {
  it('stores nothing when the choice equals the OS preference', () => {
    const out = applyPrefsToSave({ ...newEmptyState(), reduceMotion: true }, calm, calm);
    expect('reduceMotion' in out).toBe(false);
    expect('highContrast' in out).toBe(false);
  });
  it('stores a choice that differs from the OS and keeps other fields', () => {
    const base = { ...newEmptyState(), chapter: 2, extra: 'kept' };
    const out = applyPrefsToSave(base, { reduceMotion: true, highContrast: true }, calm);
    expect(out).toMatchObject({ chapter: 2, extra: 'kept', reduceMotion: true, highContrast: true });
    expect(base).not.toHaveProperty('reduceMotion');
  });
  it('lets a player opt out of an OS reduce-motion setting', () => {
    const out = applyPrefsToSave(newEmptyState(), calm, reduced);
    expect(out.reduceMotion).toBe(false);
    expect(resolvePrefs(savedPrefs(out), reduced).reduceMotion).toBe(false);
  });
  it('survives migrate (the v1 schema accepts the optional fields)', () => {
    const out = applyPrefsToSave(newEmptyState(), { reduceMotion: true, highContrast: true }, calm);
    const r = migrate(JSON.parse(JSON.stringify(out)) as unknown);
    expect(r.ok && r.value).toMatchObject({ reduceMotion: true, highContrast: true });
  });
});

describe('runtime holder', () => {
  it('re-reads the OS while nothing is saved', () => {
    setSavedPrefs({});
    expect(getPrefs(reduced).reduceMotion).toBe(true);
    setSavedPrefs({ reduceMotion: false });
    expect(getPrefs(reduced).reduceMotion).toBe(false);
    setSavedPrefs({});
  });
  it('readOsPrefs maps media queries', () => {
    const os = readOsPrefs((q) => ({ matches: q.includes('reduced-motion') }));
    expect(os).toEqual({ reduceMotion: true, highContrast: false });
    expect(readOsPrefs(undefined)).toBeDefined();
  });
});
