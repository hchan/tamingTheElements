import { describe, expect, it } from 'vitest';
import { LAYERS, TEX_SIZE, WEATHER_TEXTURES, activeLayers, emitterFade, hash2, kindBudget, steadyCount, texturePixels } from './weather-particles';

const sat = (c: number): number => {
  const r = (c >> 16) & 255;
  const g = (c >> 8) & 255;
  const b = c & 255;
  return Math.max(r, g, b) - Math.min(r, g, b);
};

describe('weather particle layers', () => {
  it('has layers for fire, water, earth and air, none for Eclipse', () => {
    expect(LAYERS.map((l) => l.length)).toEqual([3, 3, 3, 3]);
    expect(activeLayers(5, false)).toEqual([]);
    expect(activeLayers(0, false)).toEqual([]);
  });

  it('reduced motion drops every layer', () => {
    for (let k = 0; k <= 5; k++) expect(activeLayers(k, true)).toEqual([]);
  });

  it('stays muted: no tint is saturated or bright, alphas stay modest', () => {
    for (const l of LAYERS.flat()) {
      for (const t of l.tint) {
        expect(sat(t)).toBeLessThanOrEqual(130);
        expect(Math.max((t >> 16) & 255, (t >> 8) & 255, t & 255)).toBeLessThanOrEqual(0xc4);
      }
      expect(l.alpha.start).toBeLessThanOrEqual(0.9);
    }
  });

  it('keeps ranges ordered and a bounded particle budget per weather', () => {
    for (const l of LAYERS.flat()) {
      for (const rg of [l.x, l.y, l.lifespan, l.speedX, l.speedY, l.scale.start, l.scale.end]) expect(rg.min).toBeLessThanOrEqual(rg.max);
      expect(steadyCount(l)).toBeLessThanOrEqual(90);
    }
    for (let k = 1; k <= 4; k++) expect(kindBudget(k)).toBeLessThanOrEqual(200);
    expect(kindBudget(5)).toBe(0);
  });

  it('puts haze behind and flecks in front, with unique ids', () => {
    const all = LAYERS.flat();
    expect(new Set(all.map((l) => l.id)).size).toBe(all.length);
    for (const l of all) if (l.tex === 'smoke') expect(l.depth).toBe('back');
  });

  it('fades with the sky tint', () => {
    expect(emitterFade(0, 0.2)).toBe(0);
    expect(emitterFade(0.1, 0.2)).toBeCloseTo(0.5);
    expect(emitterFade(0.5, 0.2)).toBe(1);
    expect(emitterFade(0.1, 0)).toBe(0);
  });
});

describe('weather particle textures', () => {
  it('are deterministic, correctly sized, soft-edged and not empty', () => {
    for (const id of WEATHER_TEXTURES) {
      const a = texturePixels(id);
      const [w, h] = TEX_SIZE[id];
      expect(a.length).toBe(w * h * 4);
      expect(Array.from(texturePixels(id))).toEqual(Array.from(a));
      let opaque = 0;
      for (let i = 3; i < a.length; i += 4) if ((a[i] ?? 0) > 40) opaque++;
      expect(opaque).toBeGreaterThan(w * h * 0.04);
      expect(a[3]).toBe(0);
    }
  });

  it('have grain, not flat fills', () => {
    const a = texturePixels('smoke');
    const alphas = new Set<number>();
    for (let i = 3; i < a.length; i += 4) alphas.add(a[i] ?? 0);
    expect(alphas.size).toBeGreaterThan(40);
  });

  it('hash2 is stable and in range', () => {
    expect(hash2(3, 4, 5)).toBe(hash2(3, 4, 5));
    for (let i = 0; i < 50; i++) expect(hash2(i, i * 7, 1)).toBeGreaterThanOrEqual(0);
    expect(hash2(1, 2, 3)).not.toBe(hash2(2, 1, 3));
  });
});
