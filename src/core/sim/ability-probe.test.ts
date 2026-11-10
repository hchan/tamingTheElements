import { describe, expect, it } from 'vitest';
import { CHARACTERS } from '../data/characters';
import { damageTakenAfterCasting, probeAbility } from './ability-probe';

describe('port-gap audit: every ability fires from its slot in a 1v1', () => {
  for (const c of CHARACTERS) {
    if (c.id === 'dummy') continue;
    for (const slot of [0, 1] as const) {
      it(`${c.id} slot ${String(slot)} (${c.abilities[slot] ?? '?'}) fires`, () => {
        expect(probeAbility(c.id, slot).fired).toBe(true);
      });
    }
  }

  it('self effects: heal, speed, translucency and mitigation', () => {
    expect(probeAbility('fiara', 0).casterHeal).toBe(10);
    expect(probeAbility('pax', 0).casterSpeedDelta).toBe(5);
    expect(probeAbility('lavax', 1).casterSpeedDelta).toBe(2);
    expect(probeAbility('echo', 0).casterTranslucent).toBe(true);
    expect(probeAbility('sindarosa', 1).casterTranslucent).toBe(true);
    expect(damageTakenAfterCasting('rokcore', 0)).toBe(2.5);
    expect(damageTakenAfterCasting('pax', 0)).toBe(7.5);
    expect(damageTakenAfterCasting('echo', 0)).toBe(0);
  });

  it('hostile effects: freeze, slow, steal and damage', () => {
    expect(probeAbility('cyclonius', 0).targetFrozen).toBe(true);
    expect(probeAbility('treenoc', 0).targetFrozen).toBe(true);
    expect(probeAbility('morblass', 0).targetSpeedDelta).toBeLessThan(0);
    const steal = probeAbility('wispera', 1);
    expect(steal.targetDamage).toBe(30);
    expect(steal.casterHeal).toBe(30);
    expect(probeAbility('curomo', 0).targetDamage).toBe(60);
    expect(probeAbility('pax', 1).targetDamage).toBe(25);
  });
});
