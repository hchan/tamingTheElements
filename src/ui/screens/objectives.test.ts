import { describe, expect, it } from 'vitest';
import { newEmptyState } from '@core/index';
import { advancedSave, objectivesView } from './objectives';

const base = {
  ...newEmptyState(),
  chapter: 1,
  garrison: [{ id: 'a', experience: 1, characterName: 'Fiara' }],
};
const met = { ...base, garrison: [{ id: 'a', experience: 5, characterName: 'Fiara' }] };

describe('objectivesView', () => {
  it('is empty for no save or chapter 0', () => {
    expect(objectivesView(null)).toMatchObject({ lines: [], canAdvance: false });
    expect(objectivesView(newEmptyState()).canAdvance).toBe(false);
  });

  it('shows progress without advance when not met', () => {
    const v = objectivesView(base);
    expect(v.title).toBe('Chapter 1 Objectives');
    expect(v.lines.length).toBeGreaterThan(0);
    expect(v.canAdvance).toBe(false);
  });

  it('allows advance when met', () => {
    expect(objectivesView(met).canAdvance).toBe(true);
  });
});

describe('advancedSave', () => {
  it('increments chapter, or jumps to 5 when complete', () => {
    expect(advancedSave(met).chapter).toBe(2);
    expect(advancedSave({ ...met, completeTime: 1 }).chapter).toBe(5);
  });
});
