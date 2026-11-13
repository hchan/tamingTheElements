import { describe, expect, it } from 'vitest';
import { ARCADE_HERO_MAX_H, ARCADE_HERO_MIN_SCALE, ARCADE_HERO_SCALE, arcadeHeroScale, visualBox } from './hero-scale';

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
});
