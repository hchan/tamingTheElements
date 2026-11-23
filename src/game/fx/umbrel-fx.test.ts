import { describe, expect, it } from 'vitest';
import { ABILITIES_C } from '../../core';
import { MEND_TICKS, SPORE_BOX, SPORE_SPEED, SPORE_TICKS, myceliumMend, sporeBurst } from './umbrel-fx';

const get = (id: string) => ABILITIES_C.find((a) => a.id === id);

describe('umbrel fx', () => {
  it('draws to the sim projectile size and speed', () => {
    expect(get('spore-burst')).toMatchObject({ kind: 'range', speed: SPORE_SPEED, w: SPORE_BOX / 80, h: SPORE_BOX / 80 });
    expect(get('mycelium-mend')).toMatchObject({ kind: 'heal' });
  });
  it('keeps the cloud inside the projectile box and moves it at the projectile speed', () => {
    for (const age of [0, 10, 39]) {
      const f = sporeBurst(100, 50, 0, age, false);
      for (const p of f?.puffs ?? []) {
        expect(Math.abs(p.x - (f?.head.x ?? 0))).toBeLessThanOrEqual(SPORE_BOX / 2);
        expect(Math.abs(p.y - 50)).toBeLessThanOrEqual(SPORE_BOX / 2);
      }
    }
    const a = sporeBurst(100, 50, 0, 4, false)?.head.x ?? 0;
    expect((sporeBurst(100, 50, 0, 14, false)?.head.x ?? 0) - a).toBe(10 * SPORE_SPEED);
  });
  it('flies toward the facing side', () => {
    expect(sporeBurst(100, 0, 0, 2, false)?.head.x).toBeGreaterThan(100);
    expect(sporeBurst(100, 0, 4, 2, false)?.head.x).toBeLessThan(100);
  });
  it('is gone before the cast and after its ticks', () => {
    expect(sporeBurst(0, 0, 0, -1, false)).toBeUndefined();
    expect(sporeBurst(0, 0, 0, SPORE_TICKS + 1, false)).toBeUndefined();
    expect(myceliumMend(0, 0, MEND_TICKS + 1, false)).toBeUndefined();
    expect(myceliumMend(0, 0, -1, false)).toBeUndefined();
  });
  it('threads grow and the ring spreads, then fade', () => {
    const a = myceliumMend(0, 0, 2, false);
    const b = myceliumMend(0, 0, 20, false);
    expect(a?.threads).toHaveLength(6);
    expect(b?.ring.r).toBeGreaterThan(a?.ring.r ?? 0);
    expect(b?.alpha).toBeLessThan(a?.alpha ?? 0);
  });
  it('reduced motion holds still: same shapes at any age', () => {
    expect(sporeBurst(5, 5, 1, 1, true)).toEqual(sporeBurst(5, 5, 1, 30, true));
    expect(myceliumMend(5, 5, 1, true)).toEqual(myceliumMend(5, 5, 30, true));
  });
});
