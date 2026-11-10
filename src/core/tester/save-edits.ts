/**
 * Tester-mode edits of a save (see docs/TESTER-MODE.md): pure functions that return a new save. They bypass the normal
 * progression rules on purpose, so the platform only ever applies them to the throwaway tester slot unless the owner opts in.
 */
import { CHARACTERS } from '../data/characters';
import { CHARACTER_TEXT } from '../data/text-ids';
import type { IdSource } from '../rules/garrison';
import { levelFromXp } from '../rules/progression';
import type { GarrisonMemberV1, SaveV1 } from '../save/v1';

/** Highest chapter number; the tester cannot advance past it. */
export const LAST_CHAPTER = 5;

/** Smallest XP that gives `level` (inverse of `levelFromXp`: levels 5/10/15 start at XP 5/20/50). */
export function xpForLevel(level: number): number {
  const l = Math.max(0, Math.trunc(level));
  if (l < 5) return l;
  if (l < 10) return 5 + (l - 5) * 3;
  if (l < 15) return 20 + (l - 10) * 6;
  return 50 + (l - 15) * 10;
}

export type LevelEdit = { readonly by: number } | { readonly to: number };

/** Sets one garrison hero's level (XP is set to the level's minimum); an out-of-range index returns the save unchanged. */
export function levelHero(save: SaveV1, index: number, edit: LevelEdit): SaveV1 {
  const hero = save.garrison[index];
  if (hero === undefined) return save;
  const target = 'by' in edit ? levelFromXp(hero.experience) + edit.by : edit.to;
  const experience = xpForLevel(Math.max(1, target));
  const garrison: GarrisonMemberV1[] = save.garrison.map((g, i) => (i === index ? { ...g, experience } : g));
  return { ...save, garrison };
}

/** Next chapter, capped at the last one; a save that never started (chapter 0) starts at chapter 1. */
export function advanceChapterCheat(save: SaveV1): SaveV1 {
  return { ...save, chapter: Math.min(LAST_CHAPTER, Math.max(1, save.chapter + 1)) };
}

/** Adds one level-1 hero of every playable race the garrison lacks (the last boss is not a hero). */
export function addEveryRace(save: SaveV1, now: number, ids: IdSource): SaveV1 {
  const have = new Set(save.garrison.map((g) => g.characterName));
  const added: GarrisonMemberV1[] = [];
  for (const c of CHARACTERS) {
    if (c.id === 'eternal-void') continue;
    const characterName = CHARACTER_TEXT.get(c.id)?.name ?? c.id;
    if (have.has(characterName)) continue;
    added.push({ id: ids.next(), experience: 1, characterName, createdTime: now, lastModifiedTime: now });
  }
  return { ...save, chapter: Math.max(1, save.chapter), garrison: [...save.garrison, ...added] };
}

/**
 * The full cheat garrison: one hero of every character, the last boss included, all at `level`. A hero of that name already in
 * the garrison is raised to `level`; missing ones are added. Heroes of other names are kept. Starts chapter 1 if needed.
 */
export function fullGarrison(save: SaveV1, now: number, ids: IdSource, level = 15): SaveV1 {
  const experience = xpForLevel(level);
  const raised = new Set<string>();
  const garrison: GarrisonMemberV1[] = save.garrison.map((g) => {
    const known = CHARACTERS.some((c) => (CHARACTER_TEXT.get(c.id)?.name ?? c.id) === g.characterName);
    if (!known || raised.has(g.characterName)) return g;
    raised.add(g.characterName);
    return { ...g, experience, lastModifiedTime: now };
  });
  for (const c of CHARACTERS) {
    const characterName = CHARACTER_TEXT.get(c.id)?.name ?? c.id;
    if (raised.has(characterName)) continue;
    garrison.push({ id: ids.next(), experience, characterName, createdTime: now, lastModifiedTime: now });
  }
  return { ...save, chapter: Math.max(1, save.chapter), garrison };
}
