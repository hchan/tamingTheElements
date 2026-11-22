import { describe, expect, it } from 'vitest';
import { stingCastDir, stingFanAngles } from './sting-fx';

describe('stingFanAngles', () => {
  it('gives count rays, symmetric about the aim, spread wide in total', () => {
    const a = stingFanAngles(0, 5, 40);
    expect(a).toHaveLength(5);
    expect(a[0]).toBeCloseTo(-20);
    expect(a[2]).toBeCloseTo(0);
    expect(a[4]).toBeCloseTo(20);
  });
  it('turns with the aim: north is -90 degrees on screen, west -180', () => {
    expect(stingFanAngles(2, 3, 30)[1]).toBeCloseTo(-90);
    expect(stingFanAngles(4, 3, 30)[1]).toBeCloseTo(-180);
  });
  it('a single ray points straight along the aim', () => {
    expect(stingFanAngles(6, 1, 40)).toEqual([-270]);
  });
});

describe('stingCastDir', () => {
  it('uses the 8-way aim (a diagonal) rather than the 4-way facing when Arcade gives one', () => {
    expect(stingCastDir({ aim: () => 1 }, { id: 3, dir: 0 })).toBe(1);
    expect(stingFanAngles(stingCastDir({ aim: () => 1 }, { id: 3, dir: 0 }), 1, 0)[0]).toBeCloseTo(-45);
  });
  it('falls back to the facing without an aim', () => {
    expect(stingCastDir(undefined, { id: 3, dir: 4 })).toBe(4);
  });
});
