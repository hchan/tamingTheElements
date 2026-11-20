import { describe, expect, it } from 'vitest';
import { CHARACTERS, LEGACY_CHARACTERS, LEGACY_RACES, isLegacyCharacter } from '../../src/core/data/characters';
import { HERO_STYLE } from '../../src/core/data/hero-style';
import { characterId } from '../../src/core/data/ids';
import { RANGED } from '../../src/core/sim/systems/arcade/meter';
import { styleOfRace, styleSummary } from '../../tools/sim/style-summary';

describe('roster split and hero style (roster WP 0.2)', () => {
  it('pins the legacy 14 (never grows) and keeps CHARACTERS a superset', () => {
    expect(LEGACY_CHARACTERS).toHaveLength(14);
    expect(CHARACTERS.slice(0, 14).map((c) => c.id)).toEqual(LEGACY_CHARACTERS.map((c) => c.id));
    expect(LEGACY_RACES).toHaveLength(12);
    expect(isLegacyCharacter(characterId('fiara'))).toBe(true);
  });

  it('styles every legacy race: 5 melee and 7 ranged', () => {
    const styles = LEGACY_RACES.map((r) => HERO_STYLE[r]);
    expect(styles.every((x) => x === 'melee' || x === 'ranged')).toBe(true);
    expect(styles.filter((x) => x === 'melee')).toHaveLength(5);
    expect(styles.filter((x) => x === 'ranged')).toHaveLength(7);
  });

  it('the final split is 3 melee and 3 ranged in every element, over all 24 heroes', () => {
    for (const element of ['fire', 'water', 'air', 'earth']) {
      const styles = CHARACTERS.filter((c) => c.element === element).map((c) => HERO_STYLE[c.id]);
      expect(styles, element).toHaveLength(6);
      expect(styles.filter((x) => x === 'melee'), element).toHaveLength(3);
      expect(styles.filter((x) => x === 'ranged'), element).toHaveLength(3);
    }
  });

  it('the Arcade RANGED flag equals HERO_STYLE for every styled hero (roster WP 0.4)', () => {
    for (const [i, c] of CHARACTERS.entries()) {
      const style = HERO_STYLE[c.id];
      if (style !== undefined) expect([c.id, RANGED[i]]).toEqual([c.id, style === 'ranged' ? 1 : 0]);
    }
  });

  it('styleOfRace throws on a race with no HERO_STYLE row', () => {
    expect(styleOfRace('fiara')).toBe('ranged');
    expect(styleOfRace('wispera')).toBe('melee');
    expect(() => styleOfRace('eternal-void')).toThrow(/no HERO_STYLE row/);
    expect(() => styleOfRace('nobody')).toThrow(/no HERO_STYLE row/);
  });

  it('summarises a toy matrix', () => {
    const m = LEGACY_RACES.find((x) => HERO_STYLE[x] === 'melee') ?? '';
    const r = LEGACY_RACES.find((x) => HERO_STYLE[x] === 'ranged') ?? '';
    const s = styleSummary(
      [{ a: m, b: r, matches: 10, winsA: 6, winsB: 4, draws: 0 }],
      [
        { race: m, element: 'fire', winRate: 0.6 },
        { race: r, element: 'fire', winRate: 0.4 },
      ],
    );
    expect(s.crossMeleeVsRanged.winRate).toBe(0.6);
    expect(s.byElement['fire']?.gap).toBe(0.2);
  });
});
