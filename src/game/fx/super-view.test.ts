import { describe, expect, it } from 'vitest';
import { SUPER_NAMES } from '@core/index';
import { superName } from './super-view';

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
