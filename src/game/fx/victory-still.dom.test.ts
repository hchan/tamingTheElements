import { describe, expect, it } from 'vitest';
import { applyVictoryFlash, CHIP_COUNT } from './victory-still';

describe('victory flash on the portrait', () => {
  it('marks the portrait with the hero element when the flash plays', () => {
    const root = document.createElement('div');
    root.innerHTML = '<div class="matchEndMain"><div class="matchEndFace"></div></div>';
    const face = root.querySelector<HTMLElement>('.matchEndFace');
    if (!face) throw new Error('no face');
    face.animate = (() => ({})) as unknown as typeof face.animate;
    applyVictoryFlash(root, 'quarrak');
    expect(face.dataset['victoryFlashElement']).toBe('earth');
  });

  it('adds a rock-chip burst for an earth hero and no chips for another element', () => {
    HTMLElement.prototype.animate = (() => ({})) as unknown as HTMLElement['animate'];
    const mk = (hero: string): HTMLElement => {
      const root = document.createElement('div');
      root.innerHTML = '<div class="matchEndMain"><div class="matchEndFace"></div></div>';
      document.body.append(root);
      applyVictoryFlash(root, hero);
      return root;
    };
    expect(mk('quarrak').querySelectorAll('.victoryChip')).toHaveLength(CHIP_COUNT);
    expect(mk('fiara').querySelectorAll('.victoryChip')).toHaveLength(0);
  });
});
