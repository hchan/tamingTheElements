import { BEATS, CHARACTERS, seedSfc32, type CharacterId, type Element, type Sfc32 } from '@core/index';
import { ARCADE_RACES, type ArcadeAiLevel } from './arcade-pick';

/**
 * World Tour model (FUN-DESIGN 2.18, WP-tour-model): the deterministic ladder and the run state, pure (no Phaser, no DOM). The
 * same hero team and seed always give the same nine stages (the `tour` sfc32 stream of the seed); the run state is immutable and
 * round-trips through JSON for a later localStorage resume.
 */

export const TOUR_STAGES = 9;
export const TOUR_CONTINUES = 3;
export const TOUR_TEAM_SIZE = 3;

/** Easy, Normal x3, Hard x3 for the eight teams, Hard for the Void. */
const LEVELS: readonly ArcadeAiLevel[] = ['easy', 'normal', 'normal', 'normal', 'hard', 'hard', 'hard', 'hard', 'hard'];
const PLAYABLE_ELEMENTS: readonly Element[] = ['fire', 'earth', 'water', 'air'];
const VOID = 'eternal-void' as CharacterId;

export interface TourStage {
  /** 0-based; the screen shows index + 1 of 9. */
  readonly index: number;
  /** The location, which is also the backdrop and the terrain element (2.15). */
  readonly location: Element;
  readonly terrain: Element;
  /** Opponent team, the lead first; the Void boss is alone. */
  readonly opponents: readonly CharacterId[];
  readonly aiLevel: ArcadeAiLevel;
}

const elementOf = (id: CharacterId): Element => CHARACTERS.find((c) => c.id === id)?.element ?? 'void';

function shuffle<T>(rng: Sfc32, items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

/** The element that beats the hero lead's (fire if the lead has none), whose lead is the 8th team's. */
function rivalElement(lead: CharacterId): Element {
  const own = elementOf(lead);
  return PLAYABLE_ELEMENTS.find((e) => BEATS[e] === own) ?? 'fire';
}

/** Builds the 9 stages for a hero team (3 heroes, lead first) and a seed. */
export function buildTour(hero: readonly CharacterId[], seed: number): readonly TourStage[] {
  if (hero.length !== TOUR_TEAM_SIZE) throw new RangeError('a tour team has 3 heroes');
  const rng = seedSfc32(seed >>> 0, 'tour');
  const rival = rivalElement(hero[0] as CharacterId);
  const locations = [...shuffle(rng, PLAYABLE_ELEMENTS), ...[0, 1, 2].map(() => rng.pick(PLAYABLE_ELEMENTS)), rival];
  const seen = new Set<string>();
  const stages = locations.map((location, index): TourStage => {
    const leads = ARCADE_RACES.filter((r) => elementOf(r) === location);
    let opponents: CharacterId[] = [];
    for (let tries = 0; tries < 50; tries++) {
      const lead = rng.pick(leads);
      const others = shuffle(
        rng,
        ARCADE_RACES.filter((r) => r !== lead),
      ).slice(0, TOUR_TEAM_SIZE - 1);
      opponents = [lead, ...others];
      if (!seen.has(opponents.join())) break;
    }
    seen.add(opponents.join());
    return { index, location, terrain: location, opponents, aiLevel: LEVELS[index] as ArcadeAiLevel };
  });
  stages.push({ index: 8, location: 'void', terrain: 'void', opponents: [VOID], aiLevel: LEVELS[8] as ArcadeAiLevel });
  return stages;
}

export type TourStatus = 'playing' | 'lost' | 'over' | 'won';
const STATUSES: readonly TourStatus[] = ['playing', 'lost', 'over', 'won'];

export interface TourRun {
  readonly seed: number;
  readonly hero: readonly CharacterId[];
  /** 0-based stage to fight next (stays 8 once the Void is beaten). */
  readonly stage: number;
  readonly continues: number;
  /** `lost` awaits Continue or Game Over; `over` and `won` are final. */
  readonly status: TourStatus;
}

export const startRun = (hero: readonly CharacterId[], seed: number): TourRun => ({
  seed: seed >>> 0,
  hero: [...hero],
  stage: 0,
  continues: TOUR_CONTINUES,
  status: 'playing',
});

/** The fight's result: a win moves to the next stage (or wins the tour after the Void), a loss waits for Continue or Game Over. */
export function advance(run: TourRun, win: boolean): TourRun {
  if (run.status !== 'playing') return run;
  if (!win) return { ...run, status: 'lost' };
  return run.stage >= TOUR_STAGES - 1 ? { ...run, status: 'won' } : { ...run, stage: run.stage + 1 };
}

/** Replays the lost fight, spending one continue; unchanged when not lost or none are left. */
export const useContinue = (run: TourRun): TourRun =>
  run.status === 'lost' && run.continues > 0 ? { ...run, continues: run.continues - 1, status: 'playing' } : run;

/** Ends the run after a loss. */
export const gameOver = (run: TourRun): TourRun => (run.status === 'lost' ? { ...run, status: 'over' } : run);

export const serializeRun = (run: TourRun): string => JSON.stringify({ v: 1, ...run });

const isInt = (n: unknown, min: number, max: number): n is number =>
  typeof n === 'number' && Number.isInteger(n) && n >= min && n <= max;

/** Parses a saved run; undefined for anything malformed (bad JSON, wrong shape, unknown or repeated heroes, out of range). */
export function parseRun(raw: string | null | undefined): TourRun | undefined {
  let o: unknown;
  try {
    o = JSON.parse(raw ?? '');
  } catch {
    return undefined;
  }
  if (typeof o !== 'object' || o === null) return undefined;
  const r = o as Record<string, unknown>;
  const hero = r.hero;
  if (r.v !== 1 || !isInt(r.seed, 0, 0xffffffff) || !isInt(r.stage, 0, TOUR_STAGES - 1) || !isInt(r.continues, 0, TOUR_CONTINUES)) {
    return undefined;
  }
  if (!Array.isArray(hero) || hero.length !== TOUR_TEAM_SIZE || new Set(hero).size !== TOUR_TEAM_SIZE) return undefined;
  if (!hero.every((h) => ARCADE_RACES.some((id) => id === h))) return undefined;
  const status = STATUSES.find((s) => s === r.status);
  if (status === undefined) return undefined;
  return { seed: r.seed, hero: hero as CharacterId[], stage: r.stage, continues: r.continues, status };
}
