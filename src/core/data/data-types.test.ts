import { describe, expect, it } from 'vitest';
import { ELEMENTS, elementRelation } from './elements';
import { abilityId, characterId } from './ids';
import { msToTicks } from './types';
import rulesJson from '../../../tests/fixtures/legacy/rules.json';

interface Cell {
  damage: { v: number };
  reduction: { v: number };
}
const rules = rulesJson as unknown as { elementalMatrix: Record<string, Cell> };

describe('elementRelation', () => {
  it('reproduces the legacy elemental matrix', () => {
    let n = 0;
    for (const def of ELEMENTS) {
      for (const att of ELEMENTS) {
        const cell = rules.elementalMatrix[`${def}<-${att}`];
        expect(cell, `${def}<-${att}`).toBeDefined();
        // Legacy has no disadvantage multiplier: 'dis' and 'neutral' both map to 1.
        const mult = elementRelation(att, def) === 'adv' ? 1.25 : 1;
        expect(cell?.damage.v).toBe(mult);
        expect(cell?.reduction.v).toBe(mult);
        n++;
      }
    }
    expect(n).toBe(25);
  });

  it('classifies relations', () => {
    expect(elementRelation('water', 'fire')).toBe('adv');
    expect(elementRelation('fire', 'water')).toBe('dis');
    expect(elementRelation('void', 'fire')).toBe('neutral');
    expect(elementRelation('fire', 'fire')).toBe('neutral');
  });
});

describe('msToTicks', () => {
  it('converts multiples of 20', () => {
    expect(msToTicks(0)).toBe(0);
    expect(msToTicks(600)).toBe(30);
  });
  it('throws otherwise', () => {
    expect(() => msToTicks(15)).toThrow();
    expect(() => msToTicks(-20)).toThrow();
  });
});

describe('ids', () => {
  it('accept kebab slugs only', () => {
    expect(characterId('curomo')).toBe('curomo');
    expect(abilityId('chaos-bolt')).toBe('chaos-bolt');
    expect(() => abilityId('Chaos Bolt')).toThrow();
  });
});
