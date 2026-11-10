import { describe, expect, it } from 'vitest';
import { compareNumbers } from '../math/compare';
import rules from '@fixtures/legacy/rules.json';
import { CHARACTERS } from '../data/characters';
import type { ChapterNumber } from '../data/chapters';
import { DIFFICULTY } from '../data/settings';
import { seedSfc32 } from '../rng/seed';
import {
  abilitiesFor,
  applyXp,
  capturable,
  combatantStats,
  levelFromXp,
  levelMult,
  scaledMaxHealth,
  xpForWin,
} from './progression';

type Fl = { v: number; bits: string };
const scaling = rules.levelScaling as unknown as {
  health: Record<string, number>;
  damageMultiplier: Record<string, Fl>;
};
const chapters: ChapterNumber[] = [1, 2, 3, 4, 5];

describe('levelFromXp', () => {
  it('matches legacy getLevel for 0..100', () => {
    for (const [xp, level] of Object.entries(rules.getLevel as Record<string, number>)) {
      expect(levelFromXp(Number(xp))).toBe(level);
    }
  });
});

describe('level scaling', () => {
  it('levelMult matches legacy multipliers', () => {
    for (const [l, f] of Object.entries(scaling.damageMultiplier)) expect(levelMult(Number(l))).toBe(f.v);
  });
  it('scaledMaxHealth matches legacy getHealth', () => {
    for (const [k, v] of Object.entries(scaling.health)) {
      const [h, l] = k.split('@').map(Number) as [number, number];
      expect(scaledMaxHealth(h, l)).toBe(v);
    }
  });
});

describe('combatantStats', () => {
  const att = rules.applyDamageDifficulty as unknown as Record<
    string,
    { level: number; maxHealth: Fl; damageMultiplier: Fl; healMultiplier: Fl }
  >;
  it('matches legacy addLevelBonus for every difficulty, side and xp', () => {
    for (const [presetName, difficulty] of Object.entries(DIFFICULTY)) {
      const name = presetName.startsWith('WTF') ? 'WTF' : presetName;
      for (const [role, side] of [['PlayerCharacter', 'player'], ['EnemyCharacter', 'enemy']] as const) {
        for (const xp of [0, 20, 100]) {
          const e = att[`${name}|${role}|xp${String(xp)}|attacker`];
          const s = combatantStats({ maxHealth: 100 }, xp, side, difficulty);
          expect(s.level).toBe(e?.level);
          expect(s.maxHealth).toBe(e?.maxHealth.v);
          expect(s.damageMultiplier).toBe(e?.damageMultiplier.v);
          expect(s.healMultiplier).toBe(e?.healMultiplier.v);
        }
      }
    }
  });
});

describe('applyXp', () => {
  const addXP = rules.addXP as unknown as Record<
    string,
    { maxXP: number | null; capped: Record<string, { gained: number; experience: number }> }
  >;
  it('caps by chapter exactly like legacy', () => {
    for (const ch of chapters) {
      const e = addXP[`chapter${String(ch)}`];
      for (const [start, r] of Object.entries(e?.capped ?? {})) {
        const gain = ch === 5 ? 0 : ch === 1 ? 1 : r.experience === Number(start) ? 0 : undefined;
        if (gain === undefined) continue;
        expect(applyXp(Number(start), gain, ch)).toEqual({ gained: r.gained, xp: r.experience });
      }
    }
  });
  it('replays the legacy single-character sequence', () => {
    for (const ch of [1, 2, 3, 4] as const) {
      const e = rules.addXP[`chapter${String(ch)}` as 'chapter1'];
      const gains = (e.sequence).map((s, i, a) => s - (a[i - 1] ?? 0));
      let xp = 0;
      gains.forEach((g) => {
        xp = applyXp(xp, g, ch).xp;
      });
      expect(xp).toBe(e.sequence.at(-1));
    }
  });
});

describe('xpForWin', () => {
  const addXP = rules.addXP as unknown as Record<string, { histogram: Record<string, number> }>;
  it('draws from the same support set as legacy and is deterministic', () => {
    for (const ch of chapters) {
      const rng = seedSfc32(7, 'meta');
      const seen = new Set<number>();
      for (let i = 0; i < 400; i++) seen.add(xpForWin(ch, rng));
      const support = Object.keys(addXP[`chapter${String(ch)}`]?.histogram ?? {}).map(Number);
      expect([...seen].sort(compareNumbers)).toEqual(support.sort(compareNumbers));
      const a = seedSfc32(9, 'meta');
      const b = seedSfc32(9, 'meta');
      expect(xpForWin(ch, a)).toBe(xpForWin(ch, b));
    }
  });
  it('chapter 1 and 5 do not consume rng', () => {
    const rng = seedSfc32(1, 'meta');
    const before = rng.saveState();
    xpForWin(1, rng);
    xpForWin(5, rng);
    expect(rng.saveState()).toEqual(before);
  });
});

describe('capturable', () => {
  it('matches legacy isCapturable', () => {
    const t = rules.isCapturable as unknown as Record<string, boolean | number>;
    for (const [k, v] of Object.entries(t)) {
      if (typeof v !== 'boolean') continue;
      const [max, hp] = k.split('|').map(Number) as [number, number];
      expect(capturable(hp, max)).toBe(v);
    }
  });
});

describe('abilitiesFor', () => {
  const fiara = CHARACTERS.find((c) => c.id === 'fiara');
  if (!fiara) throw new Error('fiara missing');
  it('grants capture to the player after chapter 1 only', () => {
    const cap = rules.captureGranted as Record<string, Record<string, unknown>>;
    for (const ch of [1, 2, 3, 4] as const) {
      expect(abilitiesFor(fiara, ch, 'player').includes('capture' as never)).toBe('Capture' in (cap[`ch${String(ch)}|PlayerCharacter`] ?? {}));
      expect(abilitiesFor(fiara, ch, 'enemy')).toEqual(fiara.abilities);
    }
  });
});
