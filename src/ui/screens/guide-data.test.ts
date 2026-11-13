import { BEATS, WEATHER_ELEMENTS } from '@core/index';
import { WEATHER_PM } from '@core/lazy-index';
import { describe, expect, it } from 'vitest';
import { DEFAULT_BINDINGS } from '../../game/platform/input/bindings';
import { commonAbilities, damageFactor, elementalAbilities, multText, weatherCards, wheelArrows } from './guide-data';
import { ICON_NAMES } from './guide-icons';

describe('guide data', () => {
  it('has one wheel arrow per BEATS entry, with the multipliers from the damage rule', () => {
    const arrows = wheelArrows();
    expect(arrows).toHaveLength(Object.keys(BEATS).length);
    for (const a of arrows) {
      expect(BEATS[a.from]).toBe(a.to);
      expect(a.mult).toBeCloseTo(1.25, 10);
      expect(a.back).toBeCloseTo(0.8, 10);
      expect(damageFactor(a.from, a.to)).toBe(a.mult);
    }
    expect(multText(1.25)).toBe('x1.25');
    expect(multText(0.8)).toBe('x0.8');
  });

  it('common abilities cover the nine actions, with icons', () => {
    const cards = commonAbilities(DEFAULT_BINDINGS);
    expect(cards.map((c) => c.id)).toEqual(['dash', 'guard', 'charge', 'super', 'trap', 'cleanse', 'weather', 'tag', 'snag']);
    for (const c of cards) {
      expect(ICON_NAMES).toContain(c.icon);
      expect(c.key).not.toBe('');
      expect(c.effect).not.toBe('');
    }
  });

  it('has one elemental ability per wheel element', () => {
    const cards = elementalAbilities(DEFAULT_BINDINGS);
    expect(cards.map((c) => c.element)).toEqual(['fire', 'air', 'earth', 'water']);
    for (const c of cards) {
      expect(c.name).not.toBe('');
      expect(ICON_NAMES).toContain(c.icon);
    }
  });

  it('weather cards follow WEATHER_ELEMENTS and WEATHER_PM', () => {
    const cards = weatherCards();
    expect(cards.map((c) => [c.caster, c.counter])).toEqual(WEATHER_ELEMENTS);
    expect(cards[0]?.favourText).toContain(multText(WEATHER_PM / 1000));
    for (const c of cards) expect(ICON_NAMES).toContain(c.id);
  });

  it('never uses the banned player-facing words', () => {
    const all = JSON.stringify([commonAbilities(DEFAULT_BINDINGS), elementalAbilities(DEFAULT_BINDINGS), weatherCards()]);
    expect(all).not.toMatch(/classic|arcade|ruleset|capture/i);
  });
});
