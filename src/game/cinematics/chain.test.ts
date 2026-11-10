import { describe, expect, it } from 'vitest';
import { NEW_GAME_SCRIPT, STORY_CHAIN, cineToSteps, storySteps, textureKey } from './chain';

describe('story chain', () => {
  it('follows the legacy order', () => {
    expect(STORY_CHAIN.map((s) => s.title)).toEqual([
      'Homeworld: Pria',
      'The Disturbance',
      'Call of the Tamer',
      'Restoring Balance',
    ]);
  });

  it('turns every script into clear, header, caption and a key wait', () => {
    for (const s of STORY_CHAIN) {
      const steps = cineToSteps(s);
      expect(steps[0]).toEqual({ kind: 'clear' });
      expect(steps.some((x) => x.kind === 'header' && x.text === s.title)).toBe(true);
      expect(steps.at(-1)).toEqual({ kind: 'waitKey' });
    }
    expect(NEW_GAME_SCRIPT.filter((x) => x.kind === 'waitKey')).toHaveLength(4);
    expect(storySteps(2, 3).filter((x) => x.kind === 'clear')).toHaveLength(2);
  });

  it('maps texture names to load-list namespaces present in the manifest', () => {
    expect(textureKey('pria')).toBe('sprite:pria');
    expect(textureKey('priaUnbalanced')).toBe('map:priaUnbalanced');
    expect(textureKey('stars', true)).toBe('bg:stars');
  });
});
