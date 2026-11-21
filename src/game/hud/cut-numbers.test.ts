import { describe, expect, it } from 'vitest';
import { CUT_BAND_KEY, CUT_NUMBER_ALPHA, cutNumberFade, cutNumberFadeOf } from './cut-numbers';

describe('cut-in number fade', () => {
  const band = { top: 120, bottom: 280 };
  it('leaves numbers alone without a band', () => {
    expect(cutNumberFade(undefined, 100, 140)).toBe(1);
  });
  it('fades a number that overlaps the band', () => {
    expect(cutNumberFade(band, 200, 240)).toBe(CUT_NUMBER_ALPHA);
    expect(cutNumberFade(band, 100, 130)).toBe(CUT_NUMBER_ALPHA);
    expect(cutNumberFade(band, 270, 320)).toBe(CUT_NUMBER_ALPHA);
  });
  it('leaves numbers clear of the band, edges touching included', () => {
    expect(cutNumberFade(band, 40, 120)).toBe(1);
    expect(cutNumberFade(band, 280, 330)).toBe(1);
    expect(cutNumberFade(band, 400, 440)).toBe(1);
  });
  it('reads the band from the registry', () => {
    expect(cutNumberFadeOf({ get: () => undefined }, 200, 240)).toBe(1);
    expect(cutNumberFadeOf({ get: (k) => (k === CUT_BAND_KEY ? band : undefined) }, 200, 240)).toBe(CUT_NUMBER_ALPHA);
  });
});
