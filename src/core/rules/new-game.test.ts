import { describe, expect, it } from 'vitest';
import { seedSfc32 } from '../rng/seed';
import { validateV1 } from '../save/schema';
import { newGame } from './new-game';

const clock = { now: () => 1234 };

describe('newGame', () => {
  it('builds a chapter 1 save with one XP 1 character and default settings', () => {
    const s = newGame(seedSfc32(1, 'meta'), clock);
    expect(s.chapter).toBe(1);
    expect(s.difficulty).toBe(0.66);
    expect(s.displaySettings).toBe(1.25);
    expect(s.garrisonSortOrder).toBe(1);
    expect(s.garrison).toHaveLength(1);
    expect(s.garrison[0]).toMatchObject({ experience: 1, createdTime: 1234, lastModifiedTime: 1234 });
    expect(s.createdTime).toBe(1234);
    expect(validateV1(s).ok).toBe(true);
  });

  it('is deterministic for a seed and varies across seeds', () => {
    const a = newGame(seedSfc32(7, 'meta'), clock);
    expect(newGame(seedSfc32(7, 'meta'), clock)).toEqual(a);
    const names = new Set<string>();
    for (let i = 0; i < 40; i++) names.add(String(newGame(seedSfc32(i, 'meta'), clock).garrison[0]?.characterName));
    expect(names.size).toBeGreaterThan(3);
  });
});
