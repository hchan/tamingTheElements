import { describe, expect, it } from 'vitest';
import { SUPER_NAMES } from '@core/index';
import { NAME_SAFE_W, fitTitlePx, superName } from './super-view';

describe('superName', () => {
  it('names every super id from the data table, each distinct and non-empty', () => {
    expect(SUPER_NAMES.length).toBeGreaterThan(1);
    SUPER_NAMES.forEach((n, id) => {
      expect(superName(id)).toBe(n);
    });
    expect(new Set(SUPER_NAMES).size).toBe(SUPER_NAMES.length);
    expect(SUPER_NAMES.every((n) => n.trim().length > 0)).toBe(true);
  });

  it('falls back to the generic name for an unknown id (never undefined or blank)', () => {
    for (const id of [-1, SUPER_NAMES.length, 9999, Number.NaN]) expect(superName(id)).toBe(superName(0));
  });
});

describe('fitTitlePx', () => {
  it('keeps a title that fits and shrinks a wide one to the safe width', () => {
    expect(fitTitlePx(72, NAME_SAFE_W - 1, NAME_SAFE_W)).toBe(72);
    const px = fitTitlePx(72, NAME_SAFE_W * 1.5, NAME_SAFE_W);
    expect(px).toBeLessThan(72);
    expect(px).toBeGreaterThanOrEqual(29);
    expect(fitTitlePx(72, NAME_SAFE_W * 100, NAME_SAFE_W)).toBe(29);
  });
  it('leaves room beside both portrait cards', () => {
    expect(NAME_SAFE_W).toBeGreaterThan(700);
    expect(NAME_SAFE_W).toBeLessThan(1000);
  });
});
