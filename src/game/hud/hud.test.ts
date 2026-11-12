import { describe, expect, it } from 'vitest';
import {
  HC_COLORS,
  activeHeroText,
  elementCue,
  barFill,
  benchBar,
  dashSegments,
  fraction,
  getHealthColor,
  healthCue,
  healthFill,
  healthState,
  mainBar,
  sideOffset,
} from './bars';
import { buffColor, elapsedFraction, isHostile } from './buffs';
import { StatusId } from '@core/index';

const ELEMENTS = ['fire', 'air', 'earth', 'water', 'void'] as const;

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

describe('colour-blind-safe health cues', () => {
  it('classifies health into three states at the 50% and 25% lines', () => {
    expect(healthState(1)).toBe('healthy');
    expect(healthState(0.5)).toBe('healthy');
    expect(healthState(0.49)).toBe('hurt');
    expect(healthState(0.26)).toBe('hurt');
    expect(healthState(0.25)).toBe('critical');
    expect(healthState(0)).toBe('critical');
    expect(healthState(Number.NaN)).toBe('healthy');
  });
  it('every state has a distinct label and a distinct stroke pattern, independent of colour', () => {
    const cues = [1, 0.4, 0.1].map(healthCue);
    expect(new Set(cues.map((c) => c.label)).size).toBe(3);
    expect(new Set(cues.map((c) => JSON.stringify(c.dash))).size).toBe(3);
    expect(cues[0]?.dash).toBeNull();
    expect(healthCue(0.72).text).toBe('72% OK');
    expect(healthCue(0.1).text).toBe('10% LOW');
  });
  it('splits a bar into dash segments and keeps a solid bar whole', () => {
    expect(dashSegments(0, 40, null)).toEqual([[0, 40]]);
    expect(dashSegments(0, 40, [16, 6])).toEqual([
      [0, 16],
      [22, 38],
    ]);
    expect(dashSegments(0, 30, [16, 6])).toEqual([
      [0, 16],
      [22, 30],
    ]);
    expect(dashSegments(10, 10, [4, 4])).toEqual([]);
  });
  it('high contrast uses a palette whose states differ in more than red versus green', () => {
    const fills = [1, 0.4, 0.1].map((f) => healthFill(f, true));
    expect(new Set(fills).size).toBe(3);
    for (const c of fills) {
      expect(c).not.toBe(0xff0000);
      expect(c).not.toBe(0x00ff00);
    }
    expect(healthFill(1, false)).toBe(0x00ff00);
    expect(barFill(mainBar(0), 10, 100, 100, true).color).toBe(HC_COLORS.critical);
  });
  it('buffs differ by colour in both palettes (and by glyph in the HUD)', () => {
    expect(buffColor(true, false)).not.toBe(buffColor(false, false));
    expect(buffColor(true, true)).not.toBe(buffColor(false, true));
  });
});

describe('activeHeroText', () => {
  const c = { hp: 150, maxHp: 150, restCap: 150 };
  it('puts the hero name on the first line, then the health words', () => {
    const lines = activeHeroText('Pax', c, false).split('\n');
    expect(lines[0]).toBe('Pax');
    expect(lines[1]).toBe(healthCue(1).text);
  });
  it('adds the element as a glyph and word under the name, never colour alone', () => {
    expect(activeHeroText('Pax', { ...c, element: 'water' }, false).split('\n')).toEqual(['Pax', '● Water', healthCue(1).text]);
    expect(activeHeroText('Pax', { ...c, element: 'fire' }, true).split('\n').slice(0, 2)).toEqual(['Pax', '▲ Fire']);
    expect(new Set(ELEMENTS.map(elementCue)).size).toBe(ELEMENTS.length);
  });
  it('the Classic HUD keeps its HP and cap lines under the name', () => {
    const lines = activeHeroText('Curomo', c, true).split('\n');
    expect(lines).toEqual(['Curomo', `HP ${healthCue(1).text}`, 'cap 100%']);
  });
});
