import { describe, expect, it } from 'vitest';
import rules from '@fixtures/legacy/rules.json';
import { aabbContainsPoint, aabbOverlap } from './aabb';
import { DIR8_X, DIR8_Y, dir8FromSigns } from './dir8';
import { LEVEL_MULT } from './lut.generated';

function bitsOf(v: number): string {
  const dv = new DataView(new ArrayBuffer(8));
  dv.setFloat64(0, v);
  return dv.getBigUint64(0).toString(16).padStart(16, '0');
}

describe('LEVEL_MULT', () => {
  const fixture = rules.levelScaling.damageMultiplier as Record<string, { bits: string }>;

  it('has levels 0..20', () => {
    expect(LEVEL_MULT).toHaveLength(21);
  });

  it.each(Array.from({ length: 21 }, (_, i) => i))('level %i matches fixture bits', (level) => {
    expect(bitsOf(LEVEL_MULT[level] as number)).toBe(fixture[String(level)]?.bits);
  });
});

describe('dir8', () => {
  it('has 8 distinct unit-grid vectors, diagonals at full (1,1) magnitude', () => {
    const keys = new Set(DIR8_X.map((x, i) => `${String(x)},${String(DIR8_Y[i])}`));
    expect(keys.size).toBe(8);
    expect(DIR8_X.filter((x, i) => x !== 0 && DIR8_Y[i] !== 0)).toHaveLength(4);
    for (let i = 0; i < 8; i++) {
      expect(Math.abs(DIR8_X[i] as number)).toBeLessThanOrEqual(1);
      expect(Math.abs(DIR8_Y[i] as number)).toBeLessThanOrEqual(1);
    }
  });

  it('round-trips signs', () => {
    for (let i = 0; i < 8; i++) {
      expect(dir8FromSigns(DIR8_X[i] as number, DIR8_Y[i] as number)).toBe(i);
    }
    expect(dir8FromSigns(0, 0)).toBe(-1);
    expect(dir8FromSigns(5, -3)).toBe(1);
  });
});

describe('aabb', () => {
  const a = { x: 0, y: 0, w: 10, h: 10 };
  it('detects overlap but not touching edges', () => {
    expect(aabbOverlap(a, { x: 5, y: 5, w: 10, h: 10 })).toBe(true);
    expect(aabbOverlap(a, { x: 10, y: 0, w: 5, h: 5 })).toBe(false);
    expect(aabbOverlap(a, { x: -20, y: 0, w: 5, h: 5 })).toBe(false);
  });
  it('contains points half-open', () => {
    expect(aabbContainsPoint(a, 0, 0)).toBe(true);
    expect(aabbContainsPoint(a, 10, 5)).toBe(false);
  });
});
