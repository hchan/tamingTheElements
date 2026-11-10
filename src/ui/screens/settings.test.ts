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

  it('applies the accessibility checkboxes: stored only when they differ from the OS', () => {
    const calm = { reduceMotion: false, highContrast: false };
    const form = { difficulty: 0.25, displaySettings: 1, garrisonSortOrder: 2 };
    const on = applySettings(newEmptyState(), { ...form, reduceMotion: true, highContrast: false }, calm);
    expect(on.reduceMotion).toBe(true);
    expect('highContrast' in on).toBe(false);
    const off = applySettings(on, { ...form, reduceMotion: false }, calm);
    expect('reduceMotion' in off).toBe(false);
  });

  it('a form without the checkboxes leaves the saved accessibility choices alone', () => {
    const save = { ...newEmptyState(), reduceMotion: true };
    const out = applySettings(save, { difficulty: 0.25, displaySettings: 1, garrisonSortOrder: 2 });
    expect(out.reduceMotion).toBe(true);
  });

  it('stores the Arcade Versus opt-in only when on; off (or a form without it) keeps a Classic save identical', () => {
    const form = { difficulty: 0.25, displaySettings: 1, garrisonSortOrder: 2 };
    const save = newEmptyState();
    const on = applySettings(save, { ...form, arcadePreview: true });
    expect(on['arcadePreview']).toBe(true);
    const off = applySettings(on, { ...form, arcadePreview: false });
    expect('arcadePreview' in off).toBe(false);
    expect(JSON.stringify(applySettings(save, { ...form, arcadePreview: false }))).toBe(JSON.stringify(applySettings(save, form)));
    expect(applySettings(on, form)['arcadePreview']).toBe(true);
  });
});
