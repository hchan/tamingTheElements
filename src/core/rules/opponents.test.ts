import { describe, expect, it } from 'vitest';
import data from '../../../tests/fixtures/legacy/data.json';
import { seedSfc32 } from '../rng/seed';
import { OPPONENT_POOL, pickOpponents, portalOpponent, practiceOpponent } from './opponents';

const heroes = [
  { id: 'h1', experience: 7 },
  { id: 'h2', experience: 19 },
  { id: 'h3', experience: 0 },
];

describe('opponents', () => {
  it('pool matches the legacy charactersArray', () => {
    expect([...OPPONENT_POOL]).toEqual(data.charactersArray);
  });
  it('picks one pool member per hero at the same XP, ids suffixed', () => {
    const out = pickOpponents(heroes, seedSfc32(5, 'meta'));
    expect(out.map((o) => o.id)).toEqual(['h1opponent', 'h2opponent', 'h3opponent']);
    expect(out.map((o) => o.experience)).toEqual([7, 19, 0]);
    for (const o of out) expect(OPPONENT_POOL).toContain(o.characterName);
  });
  it('is reproducible and uses one meta draw per hero', () => {
    const a = pickOpponents(heroes, seedSfc32(5, 'meta'));
    expect(pickOpponents(heroes, seedSfc32(5, 'meta'))).toEqual(a);
    const m = seedSfc32(5, 'meta');
    expect(a.map((o) => o.characterName)).toEqual(heroes.map(() => OPPONENT_POOL[m.int(OPPONENT_POOL.length)]));
  });
  it('practice is a dummy at the first hero XP', () => {
    expect(practiceOpponent(heroes)).toEqual({ id: 'Dummy', experience: 7, characterName: 'Dummy' });
    expect(() => practiceOpponent([])).toThrow(RangeError);
  });
  it('portal is the last boss at the chapter 4 cap', () => {
    expect(portalOpponent()).toEqual({
      id: data.game.lastBoss,
      experience: data.garrison.MaxXP.chapter4,
      characterName: data.game.lastBoss,
    });
  });
});
