/** Opponent selection for battles, practice and the portal (legacy Garrison.updateGameParams parity). */
import { CHAPTERS } from '../data/chapters';
import type { Sfc32 } from '../rng/sfc32';

export interface OpponentHero {
  readonly id: string;
  readonly experience: number;
}

export interface Opponent {
  readonly id: string;
  readonly experience: number;
  readonly characterName: string;
}

/** Legacy GameHelper.charactersArray order (no boss or dummy); order matters for rng parity. */
export const OPPONENT_POOL: readonly string[] = [
  'Cyclonius',
  'Sindarosa',
  'Morblass',
  'Pax',
  'Wispera',
  'Fiara',
  'Curomo',
  'Rokcore',
  'Echo',
  'Lavax',
  'Ishimi',
  'Treenoc',
];

export const DUMMY_NAME = 'Dummy';
export const LAST_BOSS_NAME = 'Eternal Void';

/** One random opponent per hero at the hero's XP: index = floor(rand * pool.length), one meta draw each. */
export function pickOpponents(
  heroes: readonly OpponentHero[],
  meta: Sfc32,
  pool: readonly string[] = OPPONENT_POOL,
): Opponent[] {
  return heroes.map((h) => ({
    id: `${h.id}opponent`,
    experience: h.experience,
    characterName: pool[meta.int(pool.length)] as string,
  }));
}

/** Practice: a single dummy at the first hero's XP. */
export function practiceOpponent(heroes: readonly OpponentHero[]): Opponent {
  const first = heroes[0];
  if (first === undefined) throw new RangeError('practiceOpponent needs at least one hero');
  return { id: DUMMY_NAME, experience: first.experience, characterName: DUMMY_NAME };
}

/** Portal: the last boss at the chapter 4 XP cap. */
export function portalOpponent(): Opponent {
  const xp = CHAPTERS.find((c) => c.chapter === 4)?.maxXp ?? 100;
  return { id: LAST_BOSS_NAME, experience: xp, characterName: LAST_BOSS_NAME };
}
