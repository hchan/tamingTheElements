// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { ARCADE_SNAG_SLOT, CHARACTERS, SNAG_DESCRIPTION, SNAG_NAME } from '@core/menu-index';
import { findRace, raceRows, raceScreen } from './race';

describe('findRace', () => {
  it('finds a race by id and returns undefined for null or an unknown slug', () => {
    const first = CHARACTERS[0];
    expect(first).toBeDefined();
    expect(findRace(first?.id ?? null)).toBe(first);
    expect(findRace(null)).toBeUndefined();
    expect(findRace('nope')).toBeUndefined();
  });
});

describe('raceRows', () => {
  it('lists element, alignment, health, speed and abilities with the character values', () => {
    for (const ch of CHARACTERS) {
      const rows = new Map(raceRows(ch));
      expect(rows.get('Element')).toBe(ch.element);
      expect(rows.get('Alignment')).toBe(ch.alignment);
      expect(rows.get('Health')).toBe(String(ch.maxHealth));
      expect(rows.get('Speed')).toBe(String(ch.speed));
      expect(rows.get('Abilities')?.split(', ')).toHaveLength(ch.abilities.length);
    }
  });

  it('a Snag hero has the Snag line and the Snag name in its ability list; others have neither', () => {
    const withSnag = CHARACTERS.filter((c) => ARCADE_SNAG_SLOT[c.id] !== undefined);
    const without = CHARACTERS.filter((c) => ARCADE_SNAG_SLOT[c.id] === undefined);
    expect(withSnag.length).toBeGreaterThan(0);
    for (const c of withSnag) {
      const rows = new Map(raceRows(c));
      expect(rows.get(SNAG_NAME)).toBe(SNAG_DESCRIPTION);
      expect(rows.get('Abilities')?.split(', ')[ARCADE_SNAG_SLOT[c.id] as number]).toBe(SNAG_NAME);
    }
    for (const c of without) expect(new Map(raceRows(c)).has(SNAG_NAME)).toBe(false);
  });
});

describe('raceScreen', () => {
  it('shows Unknown race plus Back for an unknown slug', () => {
    const host = document.createElement('div');
    raceScreen('zzz').mount(host);
    expect(host.querySelector('h1')?.textContent).toBe('Unknown race');
    expect(host.querySelector('table')).toBeNull();
    expect(host.querySelector('a')?.getAttribute('href')).toBe('#main');
  });

  it('renders a table row per raceRows entry for a real race and unmount clears it', () => {
    const ch = CHARACTERS[0];
    if (!ch) throw new Error('no characters');
    const host = document.createElement('div');
    const s = raceScreen(ch.id);
    s.mount(host);
    const rows = [...host.querySelectorAll('tr')].map((tr) => [...tr.children].map((td) => td.textContent));
    expect(rows).toEqual(raceRows(ch).map(([k, v]) => [k, v]));
    expect(host.querySelector('h1')?.textContent).not.toBe('Unknown race');
    s.unmount();
    expect(host.children).toHaveLength(0);
  });
});
