import { describe, expect, it } from 'vitest';
import { ARCADE_HERO_MAX_H, ARCADE_HERO_MIN_SCALE, ARCADE_HERO_SCALE, arcadeHeroScale, visualBox, wallTuck } from './hero-scale';

describe('hero-scale', () => {
  it('scales a normal hero 2x and caps giants', () => {
    expect(arcadeHeroScale(80)).toBe(ARCADE_HERO_SCALE);
    expect(arcadeHeroScale(100) * 100).toBe(ARCADE_HERO_MAX_H);
    expect(arcadeHeroScale(320)).toBe(ARCADE_HERO_MIN_SCALE);
    expect(arcadeHeroScale(1000)).toBe(ARCADE_HERO_MIN_SCALE);
    expect(arcadeHeroScale(0)).toBe(ARCADE_HERO_SCALE);
  });
  it('grows the box about the feet centre', () => {
    const b = visualBox(100, 200, 40, 80, 2, { x: 0, y: 0, w: 0, h: 0 });
    expect(b).toEqual({ x: 80, y: 120, w: 80, h: 160 });
    expect(b.y + b.h).toBe(200 + 80);
    expect(b.x + b.w / 2).toBe(100 + 20);
  });
  it('tucks a drawn box inside the walls, by at most w(k-1)/2, and not at all at k = 1 or mid-world', () => {
    expect(wallTuck(-20, 80, 1920)).toBe(0);
    expect(wallTuck(1880 - 20, 80, 1920)).toBe(1840);
    expect(wallTuck(500, 80, 1920)).toBe(500);
    expect(visualBox(0, 200, 40, 80, 2, { x: 0, y: 0, w: 0, h: 0 }, 1920).x).toBe(0);
    expect(visualBox(1880, 200, 40, 80, 2, { x: 0, y: 0, w: 0, h: 0 }, 1920).x + 80).toBe(1920);
    expect(visualBox(0, 200, 40, 80, 1, { x: 0, y: 0, w: 0, h: 0 }, 1920).x).toBe(0);
    expect(visualBox(0, 200, 40, 80, 2, { x: 0, y: 0, w: 0, h: 0 }).x).toBe(-20);
    expect(wallTuck(5, 3000, 1920)).toBe(5);
  });
});
