/** Post-match results (legacy Victory scene): XP, captures, level-ups and boss completion. */
import { characterId } from '../data/ids';
import { CHARACTERS } from '../data/characters';
import { CHARACTER_TEXT } from '../data/text-ids';
import type { Sfc32 } from '../rng/sfc32';
import type { MatchSetup } from '../sim/match';
import { addCaptured, metaIdSource } from './garrison';
import type { Clock, GarrisonSave } from './garrison';
import { applyXp, levelFromXp, xpForWin } from './progression';

/** Legacy Game.lastBoss: defeating it completes the game, even in practice. */
const BOSS_ID = characterId('eternal-void');

export interface MatchOutcome {
  /** 0 = player team, 1 = enemy team, -1 = nobody. */
  readonly winner: number;
  /** Practice matches (legacy `Game.params.practice`) give no XP. */
  readonly practice: boolean;
  /** Index in `setup.p1` (== garrison index) of the character that was active at the end. */
  readonly activeIndex: number;
  /** Indices in `setup.p2` of captured opponents. */
  readonly capturedIndices: readonly number[];
}

export interface XpReport {
  readonly characterName: string;
  readonly gained: number;
  readonly before: number;
  readonly after: number;
  readonly levelBefore: number;
  readonly levelAfter: number;
  readonly leveledUp: boolean;
}

export interface MatchReport {
  readonly winner: number;
  readonly victory: boolean;
  readonly xp: XpReport | null;
  readonly captured: readonly { readonly characterName: string; readonly experience: number }[];
  readonly gameCompleted: boolean;
}

export interface ResultSave extends GarrisonSave {
  readonly chapter: number;
  readonly completeTime?: number | null;
  readonly lastModifiedTime?: number;
}

/** Legacy completeGame: stamps completeTime once. */
export function completeGame<S extends ResultSave>(save: S, clock: Clock): S {
  const now = clock.now();
  return { ...save, completeTime: now, lastModifiedTime: now };
}

function displayName(slug: string): string {
  const def = CHARACTERS.find((c) => c.id === slug);
  return (def && CHARACTER_TEXT.get(def.id)?.name) ?? slug;
}

/** Applies a finished match to the save and builds the report for the results UI. Input is not mutated. */
export function applyMatchResult<S extends ResultSave>(
  save: S,
  setup: MatchSetup,
  outcome: MatchOutcome,
  meta: Sfc32,
  clock: Clock,
): { save: S; report: MatchReport } {
  const victory = outcome.winner === 0;
  const bossDefeated = victory && setup.p2.some((m) => m.character === BOSS_ID);
  const none: MatchReport = { winner: outcome.winner, victory, xp: null, captured: [], gameCompleted: false };
  if (!victory) return { save, report: none };

  let next = bossDefeated ? completeGame(save, clock) : save;
  let xp: XpReport | null = null;
  const entry = save.garrison[outcome.activeIndex];
  if (!outcome.practice && entry !== undefined) {
    const res = applyXp(entry.experience, xpForWin(setup.chapter, meta), setup.chapter);
    const now = clock.now();
    const garrison = save.garrison.map((g, i) =>
      i === outcome.activeIndex ? { ...g, experience: res.xp, lastModifiedTime: now } : g,
    );
    next = { ...next, garrison, lastModifiedTime: now };
    const levelBefore = levelFromXp(entry.experience);
    const levelAfter = levelFromXp(res.xp);
    xp = {
      characterName: entry.characterName,
      gained: res.gained,
      before: entry.experience,
      after: res.xp,
      levelBefore,
      levelAfter,
      leveledUp: levelAfter > levelBefore,
    };
  }

  const captured: { characterName: string; experience: number }[] = [];
  const ids = metaIdSource(meta);
  for (const i of outcome.capturedIndices) {
    const foe = setup.p2[i];
    if (foe === undefined) continue;
    const name = displayName(foe.character);
    next = addCaptured(next, name, clock, ids);
    const last = next.garrison.length - 1;
    next = {
      ...next,
      garrison: next.garrison.map((g, k) => (k === last ? { ...g, experience: foe.xp } : g)),
    };
    captured.push({ characterName: name, experience: foe.xp });
  }

  return { save: next, report: { winner: 0, victory, xp, captured, gameCompleted: bossDefeated } };
}
