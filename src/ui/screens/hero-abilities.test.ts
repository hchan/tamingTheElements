import { describe, expect, it } from 'vitest';
import { CHARACTERS, type CharacterId } from '@core/index';
import { abilitiesSpeech, abilityChips } from './hero-abilities';

describe('hero abilities summary', () => {
  it('lists named abilities with a kind word for a hero', () => {
    const chips = abilityChips('fiara' as CharacterId);
    expect(chips.map((c) => c.name)).toEqual(['Fire Heal', 'Fireball']);
    expect(chips.map((c) => c.kind)).toEqual(['Heal', 'Ranged']);
  });
  it('covers every hero and never shows banned words', () => {
    for (const c of CHARACTERS) {
      const chips = abilityChips(c.id);
      expect(chips.length, c.id).toBe(c.abilities.length);
      expect(abilitiesSpeech(c.id)).not.toMatch(/capture|classic|arcade|ruleset/i);
    }
  });
  it('builds a screen-reader sentence', () => {
    expect(abilitiesSpeech('fiara' as CharacterId)).toBe('Abilities: Fire Heal, heal; Fireball, ranged.');
  });
});
