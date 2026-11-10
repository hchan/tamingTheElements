import { CHARACTERS } from '../data/characters';
import { GARRISON_MAX_SIZE } from '../data/chapters';
import type { SaveV1 } from './v1';

/** Bounds for values a hand-edited or hostile save file could otherwise use to hang or break the game. */
export const SAVE_LIMITS = {
  /** Legacy ceilings are 5 chapters; 0 is a fresh save. */
  chapterMax: 5,
  /** The garrison holds at most GARRISON_MAX_SIZE members; leave headroom for legacy oddities. */
  garrisonMax: GARRISON_MAX_SIZE * 10,
  experienceMax: 1_000_000_000,
  difficultyMin: 0.1,
  difficultyMax: 3,
  /** Presets run 1 to 1.6; anything else is a typo or an attack on the layout. */
  displayMin: 1,
  displayMax: 2,
  keyBindingActionsMax: 32,
  keyBindingCodesMax: 8,
} as const;

const KNOWN_NAMES: ReadonlySet<string> = new Set(CHARACTERS.map((c) => c.id as string));

/** Legacy character names map to ids by lower-casing and dashing spaces. */
export function nameToSlug(name: string): string {
  return name.toLowerCase().replace(/ /g, '-');
}

export function isKnownCharacterName(name: string): boolean {
  return KNOWN_NAMES.has(nameToSlug(name));
}

export function isKnownCharacterId(id: string): boolean {
  return KNOWN_NAMES.has(id);
}

export type SaveCheck = { ok: true } | { ok: false; issues: string[] };

/**
 * Semantic checks on a schema-valid save: known characters, value ranges, array lengths. Never throws
 * for a schema-valid save; it does not change the on-disk format.
 */
export function checkSave(save: SaveV1): SaveCheck {
  const issues: string[] = [];
  const range = (name: string, v: number, lo: number, hi: number): void => {
    if (!(v >= lo && v <= hi)) issues.push(`${name} ${String(v)} is outside ${String(lo)} to ${String(hi)}`);
  };
  range('chapter', save.chapter, 0, SAVE_LIMITS.chapterMax);
  range('difficulty', save.difficulty, SAVE_LIMITS.difficultyMin, SAVE_LIMITS.difficultyMax);
  range('displaySettings', save.displaySettings, SAVE_LIMITS.displayMin, SAVE_LIMITS.displayMax);
  if (save.garrison.length > SAVE_LIMITS.garrisonMax) {
    issues.push(`garrison has ${String(save.garrison.length)} members (limit ${String(SAVE_LIMITS.garrisonMax)})`);
  } else {
    save.garrison.forEach((m, i) => {
      if (!isKnownCharacterName(m.characterName)) issues.push(`garrison member ${String(i)} is an unknown character`);
      if (!(m.experience >= 0 && m.experience <= SAVE_LIMITS.experienceMax)) {
        issues.push(`garrison member ${String(i)} has an invalid experience value`);
      }
    });
  }
  const kb: unknown = save.keyBindings;
  if (kb !== undefined) {
    if (typeof kb !== 'object' || kb === null || Array.isArray(kb)) issues.push('keyBindings is not an object');
    else {
      const entries = Object.entries(kb);
      if (entries.length > SAVE_LIMITS.keyBindingActionsMax) issues.push('keyBindings has too many actions');
      for (const [, codes] of entries) {
        if (Array.isArray(codes) && codes.length > SAVE_LIMITS.keyBindingCodesMax) issues.push('keyBindings has too many keys');
      }
    }
  }
  return issues.length === 0 ? { ok: true } : { ok: false, issues: issues.slice(0, 20) };
}
