import { describe, expect, it } from 'vitest';
import { ELEMENTS } from '@core/index';
import { elementDescription, wikiLines } from './wiki';
import { DEFAULT_BINDINGS, bindSteal } from '../../game/platform/input/bindings';
import { newEmptyState } from '@core/index';
import { KEY_BINDINGS, bindingsFromSave, formatKeys, saveWithBindings } from './key-bindings';
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
  it('persists custom bindings in the save and drops them again at the defaults', () => {
    const custom = bindSteal(DEFAULT_BINDINGS, 'capture', 0, 'KeyV');
    const saved = saveWithBindings(newEmptyState(), custom);
    expect(saved.keyBindings?.['capture']).toEqual(['KeyV']);
    expect(bindingsFromSave(JSON.parse(JSON.stringify(saved)) as typeof saved)).toEqual(custom);
    const reset = saveWithBindings(saved, DEFAULT_BINDINGS);
    expect('keyBindings' in reset).toBe(false);
    expect(bindingsFromSave(null)).toEqual(DEFAULT_BINDINGS);
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
  it('names the Snag slot and says what it does (FUN-DESIGN 2.20)', () => {
    const rows = (slug: string): readonly (readonly [string, string])[] => {
      const ch = findRace(slug);
      return ch ? raceRows(ch) : [];
    };
    expect(rows('curomo')).toContainEqual(['Abilities', 'Ice Shock, Snag']);
    expect(rows('curomo').find(([k]) => k === 'Snag')?.[1]).toMatch(/roots.*Fire burns it/);
    expect(rows('treenoc').flat().join(' ')).not.toMatch(/Capture|Entangling/);
    expect(rows('fiara').some(([k]) => k === 'Snag')).toBe(false);
  });
});
