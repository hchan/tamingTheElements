import { describe, expect, it } from 'vitest';
import type { MatchReport } from '@core/index';
import { resultsView } from './results';

const win: MatchReport = {
  winner: 0,
  victory: true,
  xp: {
    characterName: 'Fiara',
    gained: 12,
    before: 0,
    after: 12,
    levelBefore: 1,
    levelAfter: 2,
    leveledUp: true,
  },
  captured: [{ characterName: 'Aqua', experience: 0 }],
  gameCompleted: false,
};

describe('resultsView', () => {
  it('formats victory text like legacy', () => {
    const v = resultsView({ report: win, chapter: 1, objectivesMet: false });
    expect(v.heading).toBe('Victory!');
    expect(v.avatarName).toBe('Fiara');
    expect(v.xpLines[0]).toBe('XP gained : 12');
    expect(v.xpLines[1]).toBe('Current XP : 12');
    expect(v.xpLines[2]).toMatch(/^You are now Level : \d+$/);
    expect(v.captured[0]?.text).toMatch(/^Aqua Level : \d+$/);
    expect(v.banner).toBeNull();
    expect(v.continueHref).toBe('#garrison');
  });

  it('notes max XP and plain level when not levelling', () => {
    const xp = { ...(win.xp as NonNullable<MatchReport['xp']>), gained: 0, leveledUp: false };
    const v = resultsView({ report: { ...win, xp, captured: [] }, chapter: 1, objectivesMet: false });
    expect(v.xpLines[0]).toBe('XP gained : 0 (this character has reached his max XP for this objective)');
    expect(v.xpLines[2]).toMatch(/^Level : /);
    expect(v.captured).toEqual([]);
  });

  it('omits XP for practice and shows objectives banner', () => {
    const v = resultsView({ report: { ...win, xp: null }, chapter: 2, objectivesMet: true });
    expect(v.xpLines).toEqual([]);
    expect(v.banner).toContain('Your objectives have been met for this chapter.');
    expect(v.continueHref).toBe('#main');
  });

  it('shows completion text in the last chapter', () => {
    const v = resultsView({ report: win, chapter: 4, objectivesMet: true });
    expect(v.banner).toBe('Congratulations, you have have finished this game.  Thanks for playing!');
  });

  it('defeat has text and continues to garrison', () => {
    const v = resultsView({ report: { ...win, victory: false, winner: 1 }, chapter: 1, objectivesMet: true });
    expect(v).toMatchObject({ heading: 'You have been defeated...', continueHref: '#garrison', banner: null });
  });
});
