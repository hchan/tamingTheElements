import { describe, expect, it } from 'vitest';
import { BANNER_CLEAR_ALPHA, bannerDims, easeClear, fighterUnder } from './banner-clear';

const BANNER = { x: 500, y: 275, w: 280, h: 60 };

describe('banner-clear', () => {
  it('a fighter whose head sits in the banner box dims it', () => {
    expect(fighterUnder(BANNER, [{ x: 560, y: 280, w: 120, h: 160 }])).toBe(true);
  });
  it('fighters far apart, left and right of the banner, leave it alone', () => {
    expect(fighterUnder(BANNER, [{ x: 100, y: 280, w: 120, h: 160 }, { x: 1000, y: 280, w: 120, h: 160 }])).toBe(false);
  });
  it('a fighter below the banner, or only brushing its edge, does not dim it', () => {
    expect(fighterUnder(BANNER, [{ x: 560, y: 340, w: 120, h: 160 }])).toBe(false);
    expect(fighterUnder(BANNER, [{ x: 770, y: 280, w: 120, h: 160 }])).toBe(false);
  });
  it('the multiplier eases down to the clear alpha and back to 1', () => {
    let k = 1;
    for (let i = 0; i < 40; i++) k = easeClear(k, true);
    expect(k).toBe(BANNER_CLEAR_ALPHA);
    for (let i = 0; i < 40; i++) k = easeClear(k, false);
    expect(k).toBe(1);
    expect(easeClear(1, true)).toBeLessThan(1);
  });
  it('FIGHT! and intro calls dim; K.O. stays loud', () => {
    expect(bannerDims('FIGHT!', false)).toBe(true);
    expect(bannerDims('ROUND 2', true)).toBe(true);
    expect(bannerDims('K.O.', false)).toBe(false);
  });
});
