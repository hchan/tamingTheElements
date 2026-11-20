import { describe, expect, it } from 'vitest';
import { characterId, getCharacter } from '@core/index';
import { ARCADE_RACES } from './arcade-pick';
import { advance, currentStep, ELEMENT_HITS, ELEMENT_LINE, initialProgress, isFinished, TUTORIAL_FOE, TUTORIAL_HERO, TUTORIAL_STEPS, type TutorialEvent } from './tutorial-steps';

const hit = (ability: number): TutorialEvent => ({ kind: 'hit', ability });
const SUPER: TutorialEvent = { kind: 'super' };

describe('tutorial steps', () => {
  it('has the four lessons in order, each with words and no banned player-facing terms', () => {
    expect(TUTORIAL_STEPS.map((s) => s.id)).toEqual(['attack', 'ability', 'super', 'element']);
    for (const s of TUTORIAL_STEPS) {
      expect(s.title.length).toBeGreaterThan(0);
      expect(`${s.title} ${s.prompt}`).not.toMatch(/classic|arcade|ruleset|capture/i);
    }
  });

  it('points lessons 1 and 3 at a slot and leaves lessons 2 and 4 on the arena', () => {
    expect(TUTORIAL_STEPS.map((s) => s.target?.kind ?? null)).toEqual(['ability', null, 'super', null]);
  });

  it('teaches the real element table, and the hero beats the foe', () => {
    expect(ELEMENT_LINE).toMatch(/fire beats air.*air beats earth.*earth beats water.*water beats fire/i);
    expect(getCharacter(characterId(TUTORIAL_HERO)).element).toBe('fire');
    expect(getCharacter(characterId(TUTORIAL_FOE)).element).toBe('air');
    expect(ARCADE_RACES).toContain(characterId(TUTORIAL_HERO));
    expect(ARCADE_RACES).toContain(characterId(TUTORIAL_FOE));
  });

  it('walks the lessons: a hit, a different ability, a super, then the element hits', () => {
    let p = initialProgress();
    p = advance(p, SUPER);
    expect(currentStep(p)?.id).toBe('attack');
    p = advance(p, hit(3));
    expect(currentStep(p)?.id).toBe('ability');
    p = advance(p, hit(3));
    expect(currentStep(p)?.id).toBe('ability');
    p = advance(p, hit(4));
    expect(currentStep(p)?.id).toBe('super');
    p = advance(p, hit(4));
    expect(currentStep(p)?.id).toBe('super');
    p = advance(p, SUPER);
    expect(currentStep(p)?.id).toBe('element');
    for (let i = 1; i < ELEMENT_HITS; i++) {
      p = advance(p, hit(3));
      expect(isFinished(p)).toBe(false);
    }
    p = advance(p, hit(3));
    expect(isFinished(p)).toBe(true);
    expect(advance(p, hit(3))).toBe(p);
  });
});
