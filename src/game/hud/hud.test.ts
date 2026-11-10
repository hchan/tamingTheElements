import { describe, expect, it } from 'vitest';
import { barFill, benchBar, fraction, getHealthColor, mainBar, sideOffset } from './bars';
import { elapsedFraction, isHostile } from './buffs';
import { StatusId } from '@core/index';

describe('getHealthColor (legacy ramp)', () => {
  it('is green at full, yellow at half, red at zero', () => {
    expect(getHealthColor(1)).toBe(0x00ff00);
    expect(getHealthColor(0.5)).toBe(0xffff00);
    expect(getHealthColor(0)).toBe(0xff0000);
  });
  it('treats NaN as full', () => {
    expect(getHealthColor(Number.NaN)).toBe(0x00ff00);
  });
});

describe('bar geometry', () => {
  it('matches legacy topHUD at 1280', () => {
    const m = mainBar(0);
    expect(m.minX).toBe(120);
    expect(m.maxX).toBe(560);
    expect(m.y).toBe(10);
    expect(mainBar(sideOffset(1)).minX).toBe(760);
  });
  it('places bench rows under the main bar', () => {
    const b = benchBar(0, 1);
    expect(b.minX).toBe(200 + 40 + 6);
    expect(b.maxX).toBe(560);
    expect(b.y).toBe(20 + 40 + 6);
  });
  it('fills health and rest strokes by ceil', () => {
    const f = barFill(mainBar(0), 50, 100, 80);
    expect(f.curX).toBe(340);
    expect(f.restX).toBe(472);
    expect(f.color).toBe(0xffff00);
  });
  it('clamps fractions and survives zero max', () => {
    expect(fraction(5, 0)).toBe(0);
    expect(fraction(-1, 10)).toBe(0);
    expect(fraction(20, 10)).toBe(1);
  });
});

describe('buff slots', () => {
  it('computes elapsed fraction from ticks', () => {
    expect(elapsedFraction(150, 100, 200)).toBe(0.5);
    expect(elapsedFraction(300, 100, 200)).toBe(1);
    expect(elapsedFraction(50, 100, 100)).toBe(1);
  });
  it('marks tornado and ice blast hostile', () => {
    expect(isHostile(StatusId.tornado)).toBe(true);
    expect(isHostile(StatusId.iceBlast)).toBe(true);
    expect(isHostile(StatusId.adrenaline)).toBe(false);
  });
});
