import { CAPTURE_HEALTH_FRACTION, CHAPTERS } from '../data/chapters';
import type { ChapterNumber } from '../data/chapters';
import { abilityId } from '../data/ids';
import type { AbilityId } from '../data/ids';
import type { CharacterDef } from '../data/types';
import { LEVEL_MULT } from '../math/lut.generated';
import type { Sfc32 } from '../rng/sfc32';

export type Side = 'player' | 'enemy';

export const CAPTURE_ABILITY: AbilityId = abilityId('capture');

const MAX_LEVEL = LEVEL_MULT.length - 1;

/** Legacy Garrison.getLevel: piecewise by the chapter XP caps 5 / 20 / 50. */
export function levelFromXp(xp: number): number {
  if (xp < 5) return xp;
  if (xp < 20) return 5 + Math.floor((xp - 5) / 3);
  if (xp < 50) return 10 + Math.floor((xp - 20) / 6);
  return 15 + Math.floor((xp - 50) / 10);
}

/** 1.1^L from the LUT (no pow); levels past the table are clamped to its last entry. */
export function levelMult(level: number): number {
  const i = Math.min(Math.max(Math.trunc(level), 0), MAX_LEVEL);
  return LEVEL_MULT[i] as number;
}

export function scaledMaxHealth(baseHealth: number, level: number): number {
  return Math.floor(baseHealth * levelMult(level));
}

export interface CombatantStats {
  readonly level: number;
  readonly maxHealth: number;
  readonly damageMultiplier: number;
  readonly healMultiplier: number;
}

/** Legacy addLevelBonus; the player side divides health, damage and heal by difficulty. */
export function combatantStats(
  def: Pick<CharacterDef, 'maxHealth'>,
  xp: number,
  side: Side,
  difficulty: number,
): CombatantStats {
  const level = levelFromXp(xp);
  const mult = levelMult(level);
  let maxHealth = scaledMaxHealth(def.maxHealth, level);
  let damageMultiplier = mult;
  let healMultiplier = mult;
  if (side === 'player') {
    const inv = 1 / difficulty;
    maxHealth *= inv;
    damageMultiplier *= inv;
    healMultiplier *= inv;
  }
  return { level, maxHealth, damageMultiplier, healMultiplier };
}

function maxXpFor(chapter: ChapterNumber): number | null {
  const c = CHAPTERS.find((x) => x.chapter === chapter);
  if (!c) throw new RangeError(`unknown chapter ${String(chapter)}`);
  return c.maxXp;
}

/** XP per win: chapter 1 is 1, chapters 2..4 are 1 + int(chapter), chapter 5 gives none. */
export function xpForWin(chapter: ChapterNumber, meta: Sfc32): number {
  if (chapter === 1) return 1;
  if (chapter === 5) return 0;
  return 1 + meta.int(chapter);
}

export interface XpResult {
  readonly gained: number;
  readonly xp: number;
}

/** Adds XP capped by the chapter's maxXp; `gained` may be negative when already above the cap (legacy). */
export function applyXp(xp: number, gain: number, chapter: ChapterNumber): XpResult {
  const max = maxXpFor(chapter);
  if (max === null || xp + gain <= max) return { gained: gain, xp: xp + gain };
  return { gained: max - xp, xp: max };
}

export function capturable(health: number, maxHealth: number): boolean {
  return health <= maxHealth * CAPTURE_HEALTH_FRACTION;
}

/** Ability ids for a combatant; the player side gains Capture after chapter 1. */
export function abilitiesFor(
  def: Pick<CharacterDef, 'abilities'>,
  chapter: ChapterNumber,
  side: Side,
): readonly AbilityId[] {
  return side === 'player' && chapter > 1 ? [...def.abilities, CAPTURE_ABILITY] : def.abilities;
}
