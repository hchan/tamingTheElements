import { describe, expect, it } from 'vitest';
import { CHARACTERS, LEGACY_CHARACTERS, LEGACY_RACES, isLegacyCharacter } from '../../src/core/data/characters';
import { HERO_STYLE } from '../../src/core/data/hero-style';
import { characterId } from '../../src/core/data/ids';
import { styleSummary } from '../../tools/sim/style-summary';

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
