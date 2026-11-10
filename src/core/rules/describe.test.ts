import { describe, expect, it } from 'vitest';
import { ABILITIES_A } from '../data/abilities-a';
import { ABILITIES_B } from '../data/abilities-b';
import { describeAbility, renderAbilityDescription } from './describe';

const all = [...ABILITIES_A, ...ABILITIES_B];
const find = (id: string) => {
  const a = all.find((x) => x.id === id);
  if (!a) throw new Error(id);
  return a;
};
const render = (id: string, level: number) => renderAbilityDescription(describeAbility(find(id), level));

const FB = (d: number) =>
  `Type : Range<br/>Damage : ${String(d)}<br/>Projectile Speed : 8<br/>Max projectiles active : 2<br/>Cooldown : 600ms <br/>`;
const FH = (h: number) => `Type : Heal<br/>Heal : ${String(h)}<br/>Cooldown : 40000ms <br/>`;
const RA = 'Type : Buff<br/>Damage Taken Reduced By : 75%<br/>Duration : 3000ms <br/>Cooldown : 15000ms <br/>';
const HU = (d: number) =>
  `Type : Melee<br/>Damage : ${String(d)}<br/>Duration : 3000ms <br/>Cooldown : 6000ms <br/>Addtional info : Melee attack that moves with the player and inflicts damage when opponent is inside the hurricane<br/>`;

// Expected strings hand-derived from legacy GameHelper.getAbilityDescription (floor(base*1.1^L)).
const TABLE: readonly (readonly [string, number, string])[] = [
  ['fire-blast', 0, FB(40)],
  ['fire-blast', 5, FB(64)],
  ['fire-blast', 10, FB(103)],
  ['fire-heal', 0, FH(10)],
  ['fire-heal', 5, FH(16)],
  ['fire-heal', 10, FH(25)],
  ['rock-armour', 0, RA],
  ['rock-armour', 5, RA],
  ['rock-armour', 10, RA],
  ['hurricane', 0, HU(13)],
  ['hurricane', 5, HU(20)],
  ['hurricane', 10, HU(33)],
];

describe('describeAbility vs legacy getAbilityDescription', () => {
  for (const [id, level, expected] of TABLE) {
    it(`${id} L${String(level)}`, () => {
      expect(render(id, level)).toBe(expected);
    });
  }

  it('structured form carries numeric fields', () => {
    expect(describeAbility(find('fire-blast'), 5)).toMatchObject({ type: 'Range', damage: 64, cooldownMs: 600 });
  });
});
