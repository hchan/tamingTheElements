import { describe, expect, it } from 'vitest';
import { DEFAULT_UI_FLAGS, parseUiFlags } from './flags';

describe('ui flags', () => {
  it('default off with no query', () => {
    expect(parseUiFlags('', { DEV: true, MODE: 'development' })).toEqual(DEFAULT_UI_FLAGS);
  });
  it('honours ?ff in dev and test', () => {
    expect(parseUiFlags('?ff=showFps', { DEV: true, MODE: 'development' }).showFps).toBe(true);
    expect(parseUiFlags('?ff=debugOverlay,showFps', { DEV: false, MODE: 'test' })).toEqual({
      ...DEFAULT_UI_FLAGS,
      debugOverlay: true,
      showFps: true,
    });
    expect(parseUiFlags('?ff=forceNoWebgl', { DEV: true, MODE: 'development' }).forceNoWebgl).toBe(true);
    expect(parseUiFlags('?ff=arenaDemo,arcade', { DEV: false, MODE: 'test' })).toMatchObject({ arenaDemo: true, arcade: true });
    expect(parseUiFlags('?ff=arcade', { DEV: false, MODE: 'production' }).arcade).toBe(false);
    expect(parseUiFlags('?ff=rollback', { DEV: false, MODE: 'test' }).rollback).toBe(true);
    expect(parseUiFlags('?ff=rollback', { DEV: false, MODE: 'production' }).rollback).toBe(false);
  });
  it('parses ?seed only in dev and test', () => {
    expect(parseUiFlags('?seed=42', { DEV: false, MODE: 'test' }).seed).toBe(42);
    expect(parseUiFlags('?seed=abc', { DEV: true, MODE: 'development' }).seed).toBeNull();
    expect(parseUiFlags('?seed=42', { DEV: false, MODE: 'production' }).seed).toBeNull();
  });
  it('reads ff=netbot in dev and test builds only', () => {
    expect(parseUiFlags('?ff=arcade,netbot', { DEV: false, MODE: 'test' }).netbot).toBe(true);
    expect(parseUiFlags('?ff=arcade', { DEV: true, MODE: 'development' }).netbot).toBe(false);
    expect(parseUiFlags('?ff=netbot', { DEV: false, MODE: 'production' }).netbot).toBe(false);
  });
  it('ignores ?ff in production', () => {
    expect(parseUiFlags('?ff=showFps', { DEV: false, MODE: 'production' })).toEqual(DEFAULT_UI_FLAGS);
  });

  it('reads ?cheats=1 in dev and test builds only', () => {
    expect(parseUiFlags('?cheats=1', { DEV: true, MODE: 'development' }).cheats).toBe(true);
    expect(parseUiFlags('?cheats=1', { DEV: false, MODE: 'test' }).cheats).toBe(true);
    expect(parseUiFlags('?cheats=0', { DEV: true, MODE: 'development' }).cheats).toBe(false);
    expect(parseUiFlags('?cheats=1', { DEV: false, MODE: 'production' }).cheats).toBe(false);
  });

  it('reads ff=holdSplash in dev and test builds only', () => {
    expect(parseUiFlags('?ff=holdSplash', { DEV: false, MODE: 'test' }).holdSplash).toBe(true);
    expect(parseUiFlags('?ff=arcade', { DEV: true, MODE: 'development' }).holdSplash).toBe(false);
    expect(parseUiFlags('?ff=holdSplash', { DEV: false, MODE: 'production' }).holdSplash).toBe(false);
  });
});
