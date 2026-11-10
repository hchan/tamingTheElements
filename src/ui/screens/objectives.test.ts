import { describe, expect, it } from 'vitest';
import { newEmptyState } from '@core/index';
import { advancedSave, captureNotice, objectivesView } from './objectives';

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

describe('captureNotice', () => {
  it('is absent in chapter 1 and says Capture unlocked! with the live key in chapter 2', () => {
    expect(captureNotice(1, 'C')).toBeNull();
    expect(captureNotice(0, 'C')).toBeNull();
    const n = captureNotice(2, 'V');
    expect(n?.title).toBe('Capture unlocked!');
    expect(n?.text).toContain('Press V');
    expect(n?.sprite).toBe('capture');
  });
  it('stays as a reminder in later chapters without the "new" wording', () => {
    const n = captureNotice(3, 'C');
    expect(n?.title).toBe('Capture ability');
    expect(n?.text).not.toContain('New ability');
  });
});
