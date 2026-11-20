import { describe, expect, it } from 'vitest';
import { characterId, getCharacter } from '@core/index';
import { ARCADE_RACES } from './arcade-pick';
import { advance, currentStep, ELEMENT_HITS, ELEMENT_LINE, initialProgress, isFinished, TUTORIAL_FOE, TUTORIAL_HERO, TUTORIAL_SCENES, TUTORIAL_STEPS, type TutorialEvent } from './tutorial-steps';

const hit = (ability: number): TutorialEvent => ({ kind: 'hit', ability });
const SUPER: TutorialEvent = { kind: 'super' };

describe('tutorial steps', () => {
  it('has the lessons in order, each with words and no banned player-facing terms', () => {
    expect(TUTORIAL_STEPS.map((s) => s.id)).toEqual(['attack', 'ability', 'super', 'element', 'weather', 'cleanse', 'guard', 'patchFire', 'patchWater', 'patchAir', 'patchEarth']);
    for (const s of TUTORIAL_STEPS) {
      expect(s.title.length).toBeGreaterThan(0);
      expect(`${s.title} ${s.prompt}`).not.toMatch(/classic|arcade|ruleset|capture/i);
    }
  });

  it('points the slot lessons at a slot and leaves the arena lessons alone', () => {
    expect(TUTORIAL_STEPS.map((s) => s.target?.kind ?? null)).toEqual(['ability', null, 'super', null, 'weather', 'cleanse', 'guard', null, null, null, null]);
  });

  it('fights each patch lesson with a hero of the stage element (the rock lesson with a non-earth hero)', () => {
    for (const s of TUTORIAL_STEPS) {
      const scene = TUTORIAL_SCENES[s.scene];
      expect(ARCADE_RACES).toContain(characterId(scene.hero));
      expect(ARCADE_RACES).toContain(characterId(scene.foe));
      if (s.id === 'patchFire' || s.id === 'patchWater' || s.id === 'patchAir') expect(getCharacter(characterId(scene.hero)).element).toBe(scene.stage);
      if (s.id === 'patchEarth') expect(getCharacter(characterId(scene.hero)).element).not.toBe('earth');
    }
  });

  it('walks weather, cleanse, guard and the patches', () => {
    let p = { ...initialProgress(), index: 4 };
    for (const [id, e] of [['weather', 'weather'], ['cleanse', 'cleanse'], ['guard', 'guard']] as const) {
      expect(currentStep(p)?.id).toBe(id);
      p = advance(advance(p, SUPER), { kind: e });
    }
    // Fire patch: a hit counts only while standing on a patch.
    expect(currentStep(p)?.id).toBe('patchFire');
    p = advance(p, hit(3));
    expect(currentStep(p)?.id).toBe('patchFire');
    p = advance(advance(p, { kind: 'patch' }), { kind: 'patchLeft' });
    p = advance(p, hit(3));
    expect(currentStep(p)?.id).toBe('patchFire');
    p = advance(advance(p, { kind: 'patch' }), hit(3));
    expect(currentStep(p)?.id).toBe('patchWater');
    p = advance(p, { kind: 'patch' });
    expect(currentStep(p)?.id).toBe('patchAir');
    p = advance(advance(p, { kind: 'blocked' }), { kind: 'patch' });
    expect(currentStep(p)?.id).toBe('patchEarth');
    p = advance(p, { kind: 'blocked' });
    expect(isFinished(p)).toBe(true);
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
    expect(currentStep(p)?.id).toBe('weather');
    expect(advance(p, hit(3))).toBe(p);
  });
});
