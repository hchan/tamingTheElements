import { describe, expect, it } from 'vitest';
import { applyVictoryFlash } from './victory-still';

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
});
