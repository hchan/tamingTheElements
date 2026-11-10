import { msToTicks } from './types';

export type ChapterNumber = 1 | 2 | 3 | 4 | 5;

export type Objective =
  | { readonly kind: 'levelAtLeastFirst'; readonly level: number }
  | { readonly kind: 'garrisonSizeAtLeast'; readonly size: number }
  | { readonly kind: 'countAtLevel'; readonly level: number; readonly count: number; readonly exact: boolean }
  | { readonly kind: 'defeatBoss' };

export interface ChapterDef {
  readonly chapter: ChapterNumber;
  /** XP cap per garrison character; null = no XP cap (chapter 5). */
  readonly maxXp: number | null;
  /** Inclusive XP gained per win. */
  readonly xpGain: { readonly min: number; readonly max: number };
  /** All must be met to complete the chapter. */
  readonly objectives: readonly Objective[];
}

export const CHAPTERS: readonly ChapterDef[] = [
  {
    chapter: 1,
    maxXp: 5,
    xpGain: { min: 1, max: 1 },
    objectives: [{ kind: 'levelAtLeastFirst', level: 5 }],
  },
  {
    chapter: 2,
    maxXp: 20,
    xpGain: { min: 1, max: 2 },
    objectives: [
      { kind: 'garrisonSizeAtLeast', size: 3 },
      { kind: 'countAtLevel', level: 10, count: 3, exact: true },
    ],
  },
  {
    chapter: 3,
    maxXp: 50,
    xpGain: { min: 1, max: 3 },
    objectives: [{ kind: 'countAtLevel', level: 15, count: 3, exact: true }],
  },
  {
    chapter: 4,
    maxXp: 100,
    xpGain: { min: 1, max: 4 },
    objectives: [{ kind: 'defeatBoss' }],
  },
  { chapter: 5, maxXp: null, xpGain: { min: 0, max: 0 }, objectives: [] },
];

export const GARRISON_MAX_SIZE = 10;

/** Combat constants (legacy values). */
export const SWAP_COOLDOWN_TICKS = msToTicks(5000); // 250 ticks
export const CAPTURE_HEALTH_FRACTION = 0.25;
/** Fraction of max health regained per second while benched. */
export const REST_HEAL_FRACTION_PER_SEC = 0.005;
export const CHARACTER_WIDTH = 80;
export const CHARACTER_HEIGHT = 80;
export const ARENA_WIDTH = 1280;
export const ARENA_HEIGHT = 720;
