import { describe, expect, it } from 'vitest';
import { CHARACTERS, levelFromXp, scaledMaxHealth } from '@core/index';
import type { GarrisonEntry } from '@core/index';
import { characterDetails, descriptionLines, elementRelations, findGarrisonEntry } from './character-details';
import { resolveRoute } from '../router';

function entry(characterName: string, experience: number): GarrisonEntry {
  return { id: 'g1', experience, characterName, createdTime: 0, lastModifiedTime: 0 };
}

describe('characterDetails', () => {
  it('scales health by level and lists abilities with descriptions', () => {
    const def = CHARACTERS.find((c) => c.id === 'fiara');
    expect(def).toBeDefined();
    const v = characterDetails(entry('Fiara', 12), 1);
    expect(v).toBeDefined();
    expect(v?.level).toBe(levelFromXp(12));
    expect(v?.maxHealth).toBe(scaledMaxHealth(def?.maxHealth ?? 0, levelFromXp(12)));
    expect(v?.element).toBe('fire');
    expect(v?.abilities.length).toBe(def?.abilities.length);
    for (const a of v?.abilities ?? []) {
      expect(a.lines[0]).toMatch(/^Type : /);
      expect(a.lines.some((l) => l.startsWith('Cooldown : '))).toBe(true);
      expect(a.lines.join('')).not.toContain('<');
    }
  });

  it('adds Capture for the player after chapter 1', () => {
    const c1 = characterDetails(entry('Fiara', 0), 1);
    const c2 = characterDetails(entry('Fiara', 0), 2);
    expect(c1?.abilities.some((a) => a.id === 'capture')).toBe(false);
    expect(c2?.abilities.at(-1)?.id).toBe('capture');
  });

  it('returns undefined for an unknown character', () => {
    expect(characterDetails(entry('Nobody', 0), 1)).toBeUndefined();
  });

  it('describes ability damage scaled by level', () => {
    const low = characterDetails(entry('Fiara', 0), 1);
    const high = characterDetails(entry('Fiara', 60), 1);
    expect(low?.abilities.map((a) => a.lines)).not.toEqual(high?.abilities.map((a) => a.lines));
  });
});

describe('elementRelations', () => {
  it('derives strong and weak elements from BEATS', () => {
    expect(elementRelations('water')).toEqual({ strongAgainst: ['fire'], weakAgainst: ['earth'] });
    expect(elementRelations('fire')).toEqual({ strongAgainst: ['air'], weakAgainst: ['water'] });
    expect(elementRelations('void')).toEqual({ strongAgainst: [], weakAgainst: [] });
  });
});

describe('helpers', () => {
  it('finds garrison entries by id', () => {
    const save = { garrison: [entry('Fiara', 0)] };
    expect(findGarrisonEntry(save, 'g1')?.characterName).toBe('Fiara');
    expect(findGarrisonEntry(save, 'zz')).toBeUndefined();
    expect(findGarrisonEntry(save, null)).toBeUndefined();
  });

  it('splits legacy markup into plain lines', () => {
    const def = {
      id: 'x',
      kind: 'melee',
      sprite: 's',
      maxActive: 1,
      cooldownMs: 1000,
      cooldownTicks: 50,
      damage: 10,
    } as unknown as Parameters<typeof descriptionLines>[0];
    expect(descriptionLines(def, 0)).toEqual(['Type : Melee', 'Damage : 10', 'Cooldown : 1000ms']);
  });
});

describe('character route', () => {
  it('resolves #character_<id> and rejects bad ids', () => {
    expect(resolveRoute('#character_abc-1')).toEqual({ name: 'character', param: 'abc-1' });
    expect(resolveRoute('#character_').name).toBe('main');
    expect(resolveRoute('#character_<x>').name).toBe('main');
    expect(resolveRoute('#character').name).toBe('main');
  });
});
