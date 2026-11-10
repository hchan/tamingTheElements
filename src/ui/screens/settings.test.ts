import { describe, expect, it } from 'vitest';
import { DIFFICULTY, DISPLAY_SCALE, newEmptyState } from '@core/index';
import { applySettings } from './settings';

describe('applySettings', () => {
  it('writes numbers from string radio values', () => {
    const out = applySettings(newEmptyState(), {
      difficulty: String(DIFFICULTY.Hard),
      displaySettings: String(DISPLAY_SCALE.Largest),
      garrisonSortOrder: '3',
    });
    expect(out.difficulty).toBe(1.12);
    expect(out.displaySettings).toBe(1.6);
    expect(out.garrisonSortOrder).toBe(3);
  });

  it('ignores invalid values and does not mutate the input', () => {
    const save = newEmptyState();
    const out = applySettings(save, { difficulty: 'abc', displaySettings: 9, garrisonSortOrder: '' });
    expect(out).toEqual(save);
    expect(out).not.toBe(save);
  });

  it('keeps unknown fields', () => {
    const save = { ...newEmptyState(), extra: 1 };
    expect(applySettings(save, { difficulty: 0.25, displaySettings: 1, garrisonSortOrder: 2 }).extra).toBe(1);
  });
});
