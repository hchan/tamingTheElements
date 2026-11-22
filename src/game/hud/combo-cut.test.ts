import { describe, expect, it } from 'vitest';
import { comboCutFade, comboCutFadeOf } from './combo-cut';
import { CUT_BAND_KEY } from './cut-numbers';

const band = { top: 200, bottom: 280 };

describe('comboCutFade', () => {
  it('hides a chip overlapping the cut band and keeps one clear of it', () => {
    expect(comboCutFade(band, 190, 230)).toBe(0);
    expect(comboCutFade(band, 100, 150)).toBe(1);
    expect(comboCutFade(band, 280, 320)).toBe(1);
  });
  it('is 1 with no band', () => {
    expect(comboCutFade(undefined, 200, 240)).toBe(1);
  });
  it('reads the registry band and honours the text origin', () => {
    const r = { get: (k: string) => (k === CUT_BAND_KEY ? band : undefined) };
    expect(comboCutFadeOf(r, 290, 1, 60)).toBe(0); // origin bottom: box 230..290
    expect(comboCutFadeOf(r, 290, 0, 60)).toBe(1); // origin top: box 290..350
    expect(comboCutFadeOf({ get: () => undefined }, 290, 1, 60)).toBe(1);
  });
});
