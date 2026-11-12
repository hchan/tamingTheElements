import { describe, expect, it } from 'vitest';
import { ABILITIES_A } from '../data/abilities-a';
import { ABILITIES_B } from '../data/abilities-b';
import { SNAG_ABILITY } from '../data/arcade';
import { CHARACTERS, getCharacter } from '../data/characters';
import { characterId } from '../data/ids';
import { DEFAULT_SIM_FLAGS } from '../flags';
import { compareStrings } from '../math/compare';
import { combatantStats } from '../rules/progression';
import { ARCADE_COOLDOWN_TICKS, ARCADE_RACE_DEFAULT, ARCADE_2V2_LIFE_DEFAULT_PM, ARCADE_2V2_LIFE_PM, ARCADE_RACE_NUMBERS, arcadeLifePm, arcadeRaceNumbers, cooldownTicksFor } from './arcade-numbers';
import { createMatch, type MatchSetup } from './match';

/** The 12 playable races (Arcade Versus and the tournaments): every character but the void ones. */
const PLAYABLE = CHARACTERS.filter((c) => c.element !== 'void').map((c) => String(c.id));
/** The World Tour's final boss, the one non-playable row (FUN-DESIGN 2.18). */
const BOSS = 'eternal-void';

/** Sanity bounds of the Arcade numbers (FUN-DESIGN 2.13): no race below Classic life, none a one-shot or a wall. */
const HP_PM = { min: 1000, max: 9000 };
const DAMAGE_PM = { min: 300, max: 3000 };

function setup(race: string, arcade: boolean, xp = 1): MatchSetup {
  return {
    simVersion: 0, seed: 3, flags: { ...DEFAULT_SIM_FLAGS, rulesetArcade: arcade }, chapter: 1, difficulty: 1,
    p1: [{ character: characterId(race), xp }], p2: [{ character: characterId('dummy'), xp }],
  };
}

describe('Arcade numbers table (FUN-DESIGN 2.13, WP-arcade-numbers)', () => {
  it('has exactly one row per playable race, plus the Tour boss', () => {
    expect(Object.keys(ARCADE_RACE_NUMBERS).sort(compareStrings)).toEqual([...PLAYABLE, BOSS].sort(compareStrings));
  });

  it('holds integer per-mille values inside the bounds', () => {
    const rows = Object.entries({ ...ARCADE_RACE_NUMBERS, default: ARCADE_RACE_DEFAULT }).filter(([race]) => race !== BOSS);
    for (const [race, [hpPm, damagePm]] of rows) {
      expect([race, Number.isInteger(hpPm), Number.isInteger(damagePm)]).toEqual([race, true, true]);
      expect(hpPm, race).toBeGreaterThanOrEqual(HP_PM.min);
      expect(hpPm, race).toBeLessThanOrEqual(HP_PM.max);
      expect(damagePm, race).toBeGreaterThanOrEqual(DAMAGE_PM.min);
      expect(damagePm, race).toBeLessThanOrEqual(DAMAGE_PM.max);
    }
  });

  it('falls back to the default row for races outside the table', () => {
    expect(arcadeRaceNumbers('dummy')).toBe(ARCADE_RACE_DEFAULT);
    expect(arcadeRaceNumbers('sindarosa')).toBe(ARCADE_RACE_NUMBERS['sindarosa']);
  });

  it('the Tour boss is a lone 580 HP Void with legacy damage (FUN-DESIGN 2.18, boss probe)', () => {
    expect(arcadeRaceNumbers(BOSS)).toEqual([580, 1000]);
    // At 0 XP, as the Tour sets up every fighter (arcadeSetup); Classic keeps the legacy 1000.
    expect(createMatch(setup(BOSS, true, 0)).state.maxHp[0]).toBe(580);
    expect(createMatch(setup(BOSS, false, 0)).state.maxHp[0]).toBe(1000);
  });

  it('Classic keeps the legacy max health; Arcade floors hpPm of it, at any level', () => {
    for (const race of [...PLAYABLE, BOSS]) {
      for (const xp of [1, 37]) {
        const legacy = combatantStats(getCharacter(characterId(race)), xp, 'player', 1).maxHealth;
        const classic = createMatch(setup(race, false, xp)).state;
        expect([race, classic.maxHp[0], classic.hp[0], classic.restCap[0]]).toEqual([race, legacy, legacy, legacy]);
        const want = Math.floor((legacy * arcadeRaceNumbers(race)[0]) / 1000);
        const arcade = createMatch(setup(race, true, xp)).state;
        expect([race, arcade.maxHp[0], arcade.hp[0], arcade.restCap[0]]).toEqual([race, want, want, want]);
      }
    }
  });

  it('cooldown overrides: Classic always gets the legacy cooldown; Arcade only changes the listed projectile slots and Snag', () => {
    const defs = [...ABILITIES_A, ...ABILITIES_B];
    for (const def of defs) {
      expect([def.id, cooldownTicksFor(def, false)]).toEqual([def.id, def.cooldownTicks]);
      expect([def.id, cooldownTicksFor(def, true)]).toEqual([def.id, ARCADE_COOLDOWN_TICKS[def.id] ?? def.cooldownTicks]);
    }
    for (const [slug, ticks] of Object.entries(ARCADE_COOLDOWN_TICKS)) {
      const def = defs.find((d) => d.id === slug);
      expect([slug, def?.kind]).toEqual([slug, slug === SNAG_ABILITY ? 'melee' : 'range']);
      expect(Number.isInteger(ticks) && (ticks ?? 0) > 0).toBe(true);
    }
  });
});

describe('Arcade 2v2 life (WP-arcade-2v2-tune)', () => {
  it('leaves a 1v1 life alone and scales a two-hero roster by the per-race table, within sane bounds', () => {
    for (const race of PLAYABLE) {
      const hp = arcadeRaceNumbers(race)[0];
      expect(arcadeLifePm(hp, 1, race)).toBe(hp);
      const pm = ARCADE_2V2_LIFE_PM[race] ?? ARCADE_2V2_LIFE_DEFAULT_PM;
      expect(pm).toBeGreaterThanOrEqual(300);
      expect(pm).toBeLessThanOrEqual(1000);
      expect(arcadeLifePm(hp, 2, race)).toBe(Math.floor((hp * pm) / 1000));
    }
    expect(Object.keys(ARCADE_2V2_LIFE_PM).every((k) => PLAYABLE.includes(k))).toBe(true);
  });
});
