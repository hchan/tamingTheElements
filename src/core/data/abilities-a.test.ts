import { describe, expect, it } from 'vitest';
import { ABILITIES_A } from './abilities-a';
import dataJson from '../../../tests/fixtures/legacy/data.json';
import rangeJson from '../../../tests/fixtures/legacy/abilities-range.json';

interface Legacy {
  type: string;
  spriteName: string;
  damage: number;
  cooldown: number;
  maxActive: number;
  speed: number;
  w: number;
  h: number;
  duration?: number;
}
interface LegacyRange {
  type: string;
  maxActive: number;
  cooldown: number;
  speed: number;
  damage: { v: number };
  w: { v: number };
  h: { v: number };
}
const data = (dataJson as unknown as { abilities: Record<string, { defaults: Legacy }> }).abilities;
const range = rangeJson as unknown as {
  omniAbilities: string[];
  abilities: Record<string, LegacyRange>;
};

const slug = (n: string): string =>
  n
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

describe('abilities-a', () => {
  it('has 17 unique abilities', () => {
    expect(ABILITIES_A).toHaveLength(17);
    expect(new Set(ABILITIES_A.map((a) => a.id)).size).toBe(17);
  });

  for (const a of ABILITIES_A) {
    it(`${a.id} matches legacy fixtures`, () => {
      const name = Object.keys(data).find((n) => slug(n) === a.id);
      expect(name, a.id).toBeDefined();
      const d = data[name as string]?.defaults as Legacy;
      const r = range.abilities[name as string] as LegacyRange;
      expect(a.sprite).toBe(d.spriteName);
      expect(a.damage).toBe(d.damage);
      expect(a.damage).toBe(r.damage.v);
      expect(a.cooldownMs).toBe(d.cooldown);
      expect(a.cooldownMs).toBe(r.cooldown);
      expect(a.cooldownTicks * 20).toBe(d.cooldown);
      expect(a.maxActive).toBe(d.maxActive);
      expect(a.maxActive).toBe(r.maxActive);
      expect(a.speed).toBe(d.speed);
      expect(a.speed).toBe(r.speed);
      expect((a.w ?? 0) * 80).toBeCloseTo(d.w, 9);
      expect((a.h ?? 0) * 80).toBeCloseTo(d.h, 9);
      expect(r.w.v).toBe(d.w);
      expect(r.h.v).toBe(d.h);
      expect(a.durationMs).toBe(d.duration);
      expect(r.type).toBe(d.type);
      const omni = range.omniAbilities.includes(name as string);
      const expected = omni ? 'omni' : a.id === 'capture' ? 'capture' : 'range';
      expect(a.kind).toBe(expected);
    });
  }
});
