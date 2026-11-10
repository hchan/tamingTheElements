import { describe, expect, it } from 'vitest';
import { DEFAULT_UI_FLAGS, parseUiFlags } from './flags';

describe('ui flags', () => {
  it('default off with no query', () => {
    expect(parseUiFlags('', { DEV: true, MODE: 'development' })).toEqual(DEFAULT_UI_FLAGS);
  });
  it('honours ?ff in dev and test', () => {
    expect(parseUiFlags('?ff=showFps', { DEV: true, MODE: 'development' }).showFps).toBe(true);
    expect(parseUiFlags('?ff=debugOverlay,showFps', { DEV: false, MODE: 'test' })).toEqual({
      debugOverlay: true,
      showFps: true,
    });
  });
  it('ignores ?ff in production', () => {
    expect(parseUiFlags('?ff=showFps', { DEV: false, MODE: 'production' })).toEqual(DEFAULT_UI_FLAGS);
  });
});
