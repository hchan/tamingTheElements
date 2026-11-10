import { describe, expect, it } from 'vitest';
import { ELEMENTS } from '@core/index';
import { elementDescription, wikiLines } from './wiki';
import { KEY_BINDINGS, formatKeys } from './key-bindings';
import { findRace, raceRows } from './race';

describe('wiki', () => {
  it('matches the legacy text for air', () => {
    expect(elementDescription('air')).toBe(
      'Air elementals will do 25% more damage and take 25% less damage from Earth elementals.  ' +
        'However, they will do 25% less damage and take 25% more damage from Fire elementals.',
    );
  });
  it('has four lines and none for void', () => {
    expect(elementDescription('void')).toBe('');
    expect(wikiLines()).toHaveLength(ELEMENTS.length - 1);
  });
});

describe('key bindings', () => {
  it('omits cheats', () => {
    const all = KEY_BINDINGS.map((b) => b.action).join('|');
    expect(all).not.toMatch(/I Win|Freeze|CaptureWin/);
    expect(KEY_BINDINGS.flatMap((b) => b.keys)).not.toContain('SHIFT-Q');
  });
  it('formats alternates', () => {
    expect(formatKeys(['SPACE', '1'])).toBe('SPACE or 1');
  });
});

describe('race', () => {
  it('finds races and rejects unknown', () => {
    expect(findRace('fiara')?.element).toBe('fire');
    expect(findRace('nope')).toBeUndefined();
    expect(findRace(null)).toBeUndefined();
  });
  it('lists rows', () => {
    const ch = findRace('fiara');
    expect(ch).toBeDefined();
    if (ch) expect(raceRows(ch)).toContainEqual(['Abilities', 'Fire Heal, Fireball']);
  });
});
