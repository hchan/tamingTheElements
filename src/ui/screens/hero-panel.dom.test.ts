// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { CHARACTERS, getCharacter } from '@core/menu-index';
import type { CharacterId } from '@core/menu-index';
import { ELEMENT_ORDER, heroProfile, heroStyle, heroesPerElement } from './hero-info';
import { heroGrid, styleBadge } from './hero-panel';

const RACES = CHARACTERS.filter((c) => ELEMENT_ORDER.includes(c.element)).map((c): CharacterId => c.id);

afterEach(() => {
  document.body.replaceChildren();
});

describe('styleBadge', () => {
  it('shows an icon and the word, so the style is never colour alone', () => {
    const b = styleBadge('ranged', true);
    expect(b.querySelector('svg')).not.toBeNull();
    expect(b.textContent).toBe('Ranged');
    expect(styleBadge('melee', true).textContent).toBe('Melee');
  });
  it('the icon-only form carries a title', () => {
    const b = styleBadge('melee', false);
    expect(b.textContent).toBe('');
    expect(b.title).toBe('Melee');
  });
});

describe('heroesPerElement / heroStyle', () => {
  it('heroesPerElement is the largest element block, at least three', () => {
    expect(heroesPerElement(RACES)).toBe(3);
    const fire = RACES.filter((id) => getCharacter(id).element === 'fire');
    expect(heroesPerElement([...RACES, ...fire])).toBe(6);
    expect(heroesPerElement([])).toBe(3);
  });
  it('both styles exist among the playable heroes and the profile carries them', () => {
    expect(new Set(RACES.map((id) => heroStyle(id)))).toEqual(new Set(['melee', 'ranged']));
    for (const id of RACES) expect(heroProfile(id).style).toBe(heroStyle(id));
  });
});

describe('heroGrid', () => {
  it('every tile names its element and style in text for screen readers', () => {
    const { tiles, order } = heroGrid({ races: RACES });
    expect(tiles).toHaveLength(RACES.length);
    order.forEach((id, i) => {
      expect(tiles[i]?.textContent ?? '').toMatch(heroStyle(id) === 'melee' ? /Melee\)/ : /Ranged\)/);
    });
  });

  it('columns follow the heroes per element (3 for the 12 released heroes)', () => {
    const g = heroGrid({ races: RACES });
    expect(g.grid.dataset['cols']).toBe('3');
    expect(g.columns()).toBe(3);
  });
});
