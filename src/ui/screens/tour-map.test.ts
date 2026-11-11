import { describe, expect, it } from 'vitest';
import { MAP_H, MAP_W, mapLayout, mapSummary, pinText } from './tour-map';

const LOC = ['fire', 'earth', 'water', 'air', 'fire', 'earth', 'water', 'air', 'void'];

describe('mapLayout', () => {
  it('places 9 distinct pins inside the picture', () => {
    const pins = mapLayout(LOC, 0, false);
    expect(pins).toHaveLength(9);
    expect(new Set(pins.map((p) => `${String(p.x)},${String(p.y)}`)).size).toBe(9);
    for (const p of pins) {
      expect(p.x).toBeGreaterThan(10);
      expect(p.x).toBeLessThan(MAP_W - 10);
      expect(p.y).toBeGreaterThan(10);
      expect(p.y).toBeLessThan(MAP_H - 30);
    }
  });
  it('marks cleared, current and locked stages', () => {
    const pins = mapLayout(LOC, 3, false);
    expect(pins.map((p) => p.state)).toEqual(['cleared', 'cleared', 'cleared', 'current', 'locked', 'locked', 'locked', 'locked', 'locked']);
  });
  it('clears everything once the tour is won', () => {
    expect(mapLayout(LOC, 8, true).every((p) => p.state === 'cleared')).toBe(true);
  });
  it('states each pin and the progress in words', () => {
    const pins = mapLayout(LOC, 1, false);
    expect(pins.map(pinText).slice(0, 3)).toEqual(['Stage 1: Fire, Cleared', 'Stage 2: Earth, Next', 'Stage 3: Water, Locked']);
    expect(mapSummary(pins)).toBe('World Tour map: 1 of 9 stages cleared, next is stage 2, Earth.');
  });
});
