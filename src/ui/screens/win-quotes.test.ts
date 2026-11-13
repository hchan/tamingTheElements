import { describe, expect, it } from 'vitest';
import { LOSS_QUOTES, WIN_QUOTES, lossQuote, quoteIndex, winQuote } from './win-quotes';

const HEROES = ['Curomo', 'Cyclonius', 'Echo', 'Fiara', 'Ishimi', 'Lavax', 'Morblass', 'Pax', 'Rokcore', 'Sindarosa', 'Treenoc', 'Wispera'];

describe('win quotes', () => {
  it('every hero in the text table has 2-3 short quotes', () => {
    for (const name of HEROES) {
      const q = WIN_QUOTES[name];
      expect(q, name).toBeDefined();
      expect(q?.length).toBeGreaterThanOrEqual(2);
      expect(q?.length).toBeLessThanOrEqual(3);
    }
  });
  it('quotes are short and never use banned player-facing words', () => {
    const all = [...Object.values(WIN_QUOTES).flat(), ...LOSS_QUOTES];
    for (const t of all) {
      expect(t.length).toBeLessThanOrEqual(60);
      expect(t).not.toMatch(/classic|arcade|ruleset|capture/i);
    }
  });
  it('is deterministic and in range', () => {
    expect(winQuote('Fiara', 7)).toBe(winQuote('Fiara', 7));
    expect(WIN_QUOTES['Fiara']).toContain(winQuote('Fiara', 7));
    expect(LOSS_QUOTES).toContain(lossQuote(3));
    for (let s = 0; s < 50; s++) expect(quoteIndex('x', s, 3)).toBeLessThan(3);
  });
  it('different salts reach every quote', () => {
    const seen = new Set<string>();
    for (let s = 0; s < 100; s++) seen.add(winQuote('Fiara', s));
    expect(seen.size).toBe(3);
  });
  it('unknown hero falls back to a generic line', () => {
    expect(winQuote(null, 0)).not.toBe('');
    expect(winQuote('Nobody', 1)).not.toBe('');
  });
});
