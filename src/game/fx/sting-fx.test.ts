import { describe, expect, it } from 'vitest';
import { stingFanAngles } from './sting-fx';

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
