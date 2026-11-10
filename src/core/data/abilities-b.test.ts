import { describe, expect, it } from 'vitest';
import { ABILITIES_B } from './abilities-b';
import dataJson from '../../../tests/fixtures/legacy/data.json';
import rangeJson from '../../../tests/fixtures/legacy/abilities-range.json';
import effectsJson from '../../../tests/fixtures/legacy/abilities-effects.json';

interface Legacy {
  defaults: Record<string, unknown>;
}
const legacy = (dataJson as unknown as { abilities: Record<string, Legacy> }).abilities;
const NAMES: Record<string, string> = {
  'ground-shock': 'Ground Shock',
  adrenaline: 'Adrenaline',
  'translucent-flame': 'Translucent Flame',
  'ice-blast': 'Ice Blast',
  'steal-health': 'Steal Health',
  'fire-heal': 'Fire Heal',
  'ice-shock': 'Ice Shock',
  'rock-armour': 'Rock Armour',
  hurricane: 'Hurricane',
  fade: 'Fade',
  'fire-dance': 'Fire Dance',
  'strangling-branches': 'Strangling Branches',
  'entangling-vines': 'Entangling Vines',
};
const KIND: Record<string, string> = { Melee: 'melee', Buff: 'buff', Heal: 'heal', Range: 'debuff' };

describe('abilities-b vs legacy data.json', () => {
  it('covers all 13 abilities', () => {
    expect(ABILITIES_B.map((a) => a.id).sort()).toEqual(Object.keys(NAMES).sort());
  });

  for (const a of ABILITIES_B) {
    it(`${a.id} matches field by field`, () => {
      const d = legacy[NAMES[a.id] ?? '']?.defaults;
      expect(d).toBeDefined();
      if (!d) return;
      expect(a.kind).toBe(KIND[d.type as string]);
      expect(a.sprite).toBe(d.spriteName);
      expect(a.cooldownMs).toBe(d.cooldown);
      expect(a.maxActive).toBe(d.maxActive);
      expect(a.damage).toBe(d.damage);
      expect(a.heal).toBe(d.heal);
      expect(a.w).toBe(d.w);
      expect(a.h).toBe(d.h);
      expect(a.speed).toBe(typeof d.speed === 'number' ? d.speed : undefined);
      expect(a.durationMs).toBe(d.duration);
      expect(a.delayAfterAttackMs).toBe(d.delayAfterAttack);
      expect(a.speedDelta).toBe(d.speedIncrease);
      expect(a.damageDecreasePercentage).toBe(d.damageDecreasePercentage);
      expect(a.effectSprite).toBe(d.effectSpriteName);
      expect(a.longSprite).toBe(d.spriteNameLong);
      expect(a.damageIntervalMs).toBe(d.nextDamgeInterval);
      expect(a.description).toBe(d.additionalDescription);
      expect(a.cooldownTicks * 20).toBe(a.cooldownMs);
      if (a.durationMs !== undefined) expect(a.durationTicks).toBe(a.durationMs / 20);
    });
  }

  it('rounds non-multiple-of-20 delays up to whole ticks', () => {
    expect(ABILITIES_B.find((a) => a.id === 'ground-shock')?.delayAfterAttackTicks).toBe(13);
    const h = ABILITIES_B.find((a) => a.id === 'hurricane');
    expect(h?.damageIntervalTicks).toBe(25);
    expect(h?.delayAfterAttackTicks).toBe(0);
  });
});

describe('abilities-b vs other fixtures', () => {
  it('melee footprints in abilities-effects.json match w/h', () => {
    const fx = effectsJson as unknown as Record<string, Record<string, unknown>>;
    for (const block of Object.values(fx)) {
      for (const [name, e] of Object.entries(block)) {
        const a = ABILITIES_B.find((x) => NAMES[x.id] === name);
        const o = e as { w?: number; h?: number } | null;
        if (a && o && typeof o === 'object' && o.w !== undefined) {
          expect(a.w, name).toBe(o.w);
          expect(a.h, name).toBe(o.h);
        }
      }
    }
  });

  it('abilities-range.json lists Ice Blast as the only ranged ability of this set', () => {
    const r = (rangeJson as unknown as { rangeAbilities: string[] }).rangeAbilities;
    expect(r).toContain('Ice Blast');
    for (const a of ABILITIES_B) {
      if (a.id !== 'ice-blast') expect(r).not.toContain(NAMES[a.id]);
    }
  });
});
