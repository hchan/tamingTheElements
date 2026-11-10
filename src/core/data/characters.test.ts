import { describe, expect, it } from 'vitest';
import { CHARACTERS, getCharacter } from './characters';
import { ELEMENTS } from './elements';
import { abilityId, characterId } from './ids';
import { ABILITY_NAMES, CHARACTER_TEXT } from './text-ids';
import dataJson from '../../../tests/fixtures/legacy/data.json';
import textJson from '../../../tests/fixtures/legacy/text.json';

interface LegacyChar {
  defaults: {
    abilitiesInfo: Record<string, unknown>;
    alignment: string;
    characterSpeed: number | { n: number };
    elementalType: string;
    maxHealth: number;
    spriteName: string;
  };
}
const legacy = (dataJson as unknown as { characters: Record<string, LegacyChar> }).characters;
const text = textJson as unknown as {
  abilities: Record<string, null>;
  characters: Record<string, string>;
};
const slug = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

describe('character defs vs legacy data.json', () => {
  it('has all 14 characters', () => {
    expect(CHARACTERS).toHaveLength(14);
    expect(CHARACTERS.map((c) => c.id).sort()).toEqual(Object.keys(legacy).map(slug).sort());
  });

  it.each(Object.entries(legacy))('%s maps field by field', (name, { defaults: d }) => {
    const c = getCharacter(characterId(slug(name)));
    expect(c.element).toBe(d.elementalType);
    expect(c.alignment).toBe(d.alignment);
    expect(c.maxHealth).toBe(d.maxHealth);
    expect(c.speed).toBe(typeof d.characterSpeed === 'number' ? d.characterSpeed : d.characterSpeed.n);
    expect(c.sprite).toBe(d.spriteName);
    expect(c.abilities).toEqual(Object.keys(d.abilitiesInfo).map((a) => abilityId(slug(a))));
    expect(ELEMENTS).toContain(c.element);
  });

  it('throws on unknown id', () => {
    expect(() => getCharacter(characterId('nobody'))).toThrow();
  });
});

describe('text ids', () => {
  it('covers every legacy name and description', () => {
    for (const [k, v] of Object.entries(text.characters)) {
      expect(CHARACTER_TEXT.get(characterId(slug(k)))).toEqual({ name: k, description: v });
    }
    for (const k of Object.keys(text.abilities)) {
      expect(ABILITY_NAMES.get(abilityId(slug(k)))).toBe(k);
    }
    expect(CHARACTER_TEXT.size).toBe(14);
    expect(ABILITY_NAMES.size).toBe(30);
  });
});
