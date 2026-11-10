import { describe, expect, it } from 'vitest';
import legacy from '../../../tests/fixtures/legacy/rules.json';

import { characterId } from '../data/ids';
import { DEFAULT_SIM_FLAGS, FLAG_NAMES, SIM_FLAG_BIT_LIMIT, decodeFlags, encodeFlags, flagBit, flagBits, type SimFlags } from '../flags';
import { headerFromSetup, setupFromHeader } from '../replay/format';
import { createStreams, saveStreams } from '../rng/streams';
import { createMatch, P1_START_X, P2_START_X, type MatchSetup } from './match';
import { EntityFlag, EntityKind, World } from './state';
import { CAPTURE_GRANTED_BIT } from './systems/capture';
import { WORLD_ENDED_BIT } from './systems/end';
import { hash } from './hash';

const fire = characterId('lavax'); // maxHealth 100, matches the fixture's stub attacker
const base: MatchSetup = {
  simVersion: 1,
  seed: 42,
  flags: DEFAULT_SIM_FLAGS,
  chapter: 1,
  difficulty: 0.66,
  p1: [{ character: fire, xp: 20 }, { character: characterId('pax'), xp: 1 }],
  p2: [{ character: fire, xp: 100 }],
};

type Row = Record<string, { v: number }>;

/** Every combination of the sim flags. */
function allFlagSets(): SimFlags[] {
  return Array.from({ length: 1 << FLAG_NAMES.length }, (_, mask) =>
    Object.fromEntries(FLAG_NAMES.map((n, i) => [n, (mask & (1 << i)) !== 0])) as unknown as SimFlags,
  );
}

describe('world flag bits', () => {
  it('give every flag in FLAG_NAMES its own bit, in sorted-name order, below the internal bits', () => {
    expect(FLAG_NAMES.length).toBeLessThanOrEqual(SIM_FLAG_BIT_LIMIT);
    const bits = FLAG_NAMES.map((n) => flagBit(n));
    expect(bits).toEqual(FLAG_NAMES.map((_, i) => 1 << i));
    expect(FLAG_NAMES).toContain('elementalAdvantage');
    for (const n of FLAG_NAMES) expect(flagBits({ ...DEFAULT_SIM_FLAGS, [n]: true })).toBe(flagBit(n));
    const internal = [CAPTURE_GRANTED_BIT, WORLD_ENDED_BIT];
    expect(new Set(internal).size).toBe(internal.length);
    for (const b of internal) expect(b).toBeGreaterThanOrEqual(1 << SIM_FLAG_BIT_LIMIT);
  });

  it('createMatch stores exactly the enabled flags plus the internal bits, and replay headers still decode', () => {
    for (const flags of allFlagSets()) {
      for (const chapter of [1, 2] as const) {
        const setup = { ...base, flags, chapter };
        const w = createMatch(setup).state.world[World.flags] ?? 0;
        expect(w & ((1 << SIM_FLAG_BIT_LIMIT) - 1)).toBe(flagBits(flags));
        expect((w & CAPTURE_GRANTED_BIT) !== 0).toBe(chapter > 1);
        expect(decodeFlags(encodeFlags(flags))).toEqual(flags);
        expect(setupFromHeader(headerFromSetup(setup, 0)).flags).toEqual(flags);
      }
    }
  });
});

describe('createMatch', () => {
  it('places teams, benches extras and seeds streams', () => {
    const s = createMatch(base).state;
    expect([s.team[0], s.team[1], s.team[2]]).toEqual([0, 0, 1]);
    expect(s.kind[0]).toBe(EntityKind.character);
    expect(s.flags[0]).toBe(EntityFlag.alive);
    expect(s.flags[1]).toBe(EntityFlag.alive | EntityFlag.benched);
    expect(s.x[0]).toBe(P1_START_X);
    expect(s.x[2]).toBe(P2_START_X);
    expect(s.y[0]).toBe(s.y[2]);
    expect(s.rng).toEqual(saveStreams(createStreams(42)));
  });

  it('is deterministic', () => {
    expect(hash(createMatch(base).state)).toBe(hash(createMatch(base).state));
  });

  it('stats equal the legacy addLevelBonus fixture', () => {
    const fx = legacy.applyDamageDifficulty as unknown as Record<string, Row>;
    for (const [name, difficulty] of Object.entries({ Easy: 0.25, Casual: 0.66, Normal: 0.85, Hard: 1.12, WTF: 1.5 })) {
      const s = createMatch({ ...base, difficulty, p1: [{ character: fire, xp: 20 }] }).state;
      const p = fx[`${name}|PlayerCharacter|xp20|attacker`] as Row;
      const e = fx[`${name}|EnemyCharacter|xp100|attacker`] as Row;
      expect(s.maxHp[0]).toBe(p['maxHealth']?.v);
      expect(s.dmgMult[0]).toBe(p['damageMultiplier']?.v);
      expect(s.healMult[0]).toBe(p['healMultiplier']?.v);
      expect(s.maxHp[1]).toBe(e['maxHealth']?.v);
      expect(s.dmgMult[1]).toBe(e['damageMultiplier']?.v);
    }
  });
});
