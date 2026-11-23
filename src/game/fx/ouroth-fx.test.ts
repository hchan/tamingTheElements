import { describe, expect, it } from 'vitest';
import { ABILITIES_C } from '../../core';
import { BREATH_BOX, BREATH_TICKS, COIL_BOX, COIL_TICKS, meleeBox, scorchBreath, wyrmCoil } from './ouroth-fx';

const get = (id: string) => ABILITIES_C.find((a) => a.id === id);
const inside = (pts: readonly number[], b: { x: number; y: number; w: number; h: number }): boolean => {
  for (let i = 0; i < pts.length; i += 2) {
    const x = pts[i] ?? 0;
    const y = pts[i + 1] ?? 0;
    if (x < b.x - 0.01 || x > b.x + b.w + 0.01 || y < b.y - 0.01 || y > b.y + b.h + 0.01) return false;
  }
  return true;
};

describe('ouroth fx', () => {
  it('draws to the sim hitbox sizes and lifetimes', () => {
    expect(get('wyrm-coil')).toMatchObject({ w: COIL_BOX.w, h: COIL_BOX.h, delayAfterAttackTicks: COIL_TICKS });
    expect(get('scorch-breath')).toMatchObject({ w: BREATH_BOX.w, h: BREATH_BOX.h, delayAfterAttackTicks: BREATH_TICKS });
  });
  it('places the box in front of the caster like the sim', () => {
    expect(meleeBox(0, 100, 100, 40, 60, 80, 70)).toEqual({ x: 140, y: 95, w: 80, h: 70 });
    expect(meleeBox(4, 100, 100, 40, 60, 110, 70)).toEqual({ x: -10, y: 95, w: 110, h: 70 });
  });
  it('keeps every drawn point inside the hitbox, both ways', () => {
    for (const dir of [0, 4]) {
      const b = meleeBox(dir, 100, 100, 40, 60, 110, 70);
      for (const age of [1, 5, 10, 14]) {
        const c = wyrmCoil(b, dir, age, false);
        const s = scorchBreath(b, dir, age, false);
        for (const band of c?.bands ?? []) expect(inside(band, b)).toBe(true);
        for (const tg of s?.tongues ?? []) expect(inside(tg, b)).toBe(true);
        expect(s?.embers.every((e) => e.x >= b.x && e.x <= b.x + b.w)).toBe(true);
      }
    }
  });
  it('ends after its ticks and holds still under reduced motion', () => {
    const b = meleeBox(0, 0, 0, 40, 60, 80, 70);
    expect(wyrmCoil(b, 0, COIL_TICKS + 1, false)).toBeUndefined();
    expect(scorchBreath(b, 0, BREATH_TICKS + 1, false)).toBeUndefined();
    expect(wyrmCoil(b, 0, 1, true)).toEqual(wyrmCoil(b, 0, 9, true));
    expect(scorchBreath(b, 0, 1, true)).toEqual(scorchBreath(b, 0, 9, true));
  });
});
