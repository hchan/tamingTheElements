import { describe, expect, it } from 'vitest';
import rules from '../../../tests/fixtures/legacy/rules.json';
import { CAPTURE_DAMAGE, computeDamage, computeHeal, damageDealt } from './damage';
import type { Element } from '../data/elements';

interface Num {
  v: number;
  bits: string;
}
const matrix = rules.applyDamageMatrix as unknown as {
  results: Record<string, { returned: Num; curHealth: Num }>;
};

describe('computeDamage vs legacy applyDamageMatrix', () => {
  for (const [key, exp] of Object.entries(matrix.results)) {
    it(key, () => {
      const m = /^([\d.e+]+)\|(\w+)<-(\w+)\|dec(\d+)$/.exec(key);
      if (!m) throw new Error(key);
      const dmg = computeDamage({
        base: Number(m[1]),
        attackerMult: 1,
        attEl: m[3] as Element,
        defEl: m[2] as Element,
        defReductionPct: Number(m[4]),
      });
      expect(Object.is(damageDealt(100, dmg), exp.returned.v)).toBe(true);
      expect(Object.is(100 - dmg, exp.curHealth.v)).toBe(true);
    });
  }
});

describe('computeDamage edges', () => {
  const e = rules.applyDamageEdges as unknown as { overkill: { returned: Num; curHealth: Num } };
  const base = { attackerMult: 1, attEl: 'fire' as Element, defEl: 'fire' as Element, defReductionPct: 0 };
  it('overkill returns pre-hit health', () => {
    const d = computeDamage({ ...base, base: 500 });
    expect(Object.is(damageDealt(20, d), e.overkill.returned.v)).toBe(true);
    expect(Object.is(20 - d, e.overkill.curHealth.v)).toBe(true);
  });
  it('over-100% reduction and negatives clamp to +0', () => {
    for (const d of [
      computeDamage({ ...base, base: 10, defReductionPct: 150 }),
      computeDamage({ ...base, base: -5 }),
      computeDamage({ ...base, base: 0 }),
    ]) {
      expect(Object.is(d, 0)).toBe(true);
    }
  });
  it('capture sentinel bypasses all modifiers', () => {
    const d = computeDamage({
      base: CAPTURE_DAMAGE,
      attackerMult: 0.1,
      attEl: 'water',
      defEl: 'fire',
      defReductionPct: 99,
    });
    expect(d).toBe(CAPTURE_DAMAGE);
  });
});

describe('computeHeal vs legacy heal', () => {
  for (const [key, exp] of Object.entries(rules.heal as unknown as Record<string, Num>)) {
    it(key, () => {
      const m = /^mult(.+)\|cur(.+)\|amt(.+)$/.exec(key);
      if (!m) throw new Error(key);
      expect(Object.is(computeHeal(Number(m[2]), Number(m[3]), Number(m[1]), 100), exp.v)).toBe(true);
    });
  }
});
