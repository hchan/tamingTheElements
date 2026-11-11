import { seedSfc32, type CharacterId } from '@core/index';
import { ARCADE_RACES, DEFAULT_PICK, partner2For, partnerFor, type ArcadePick } from './arcade-pick';
import { TOUR_CONTINUES, buildTour, type TourRun, type TourStage } from './tour-model';

/**
 * World Tour fight setup (FUN-DESIGN 2.18, WP-tour-shell): pure helpers that turn a run into the Arcade pick and match seed of
 * its current fight. No Phaser, no DOM, no storage.
 */

/** Weather kind of the four stage elements, as `ArcadeW.stage` holds it (1 fire, 2 water, 3 earth, 4 air). */
const STAGE_KIND: Readonly<Record<string, number>> = { fire: 1, water: 2, earth: 3, air: 4 };

/** The stage element the sim draws for a match seed (round 1 takes `1 + int(4)` of the `terrain.0` stream, terrain-layout.ts). */
export const stageKindOfSeed = (seed: number): number => 1 + seedSfc32(seed >>> 0, 'terrain.0').int(4);

/** The stage of the run's current fight. */
export const currentStage = (run: TourRun): TourStage => buildTour(run.hero, run.seed)[run.stage] as TourStage;

/**
 * The Arcade pick of a stage: the hero team on the player's side, the stage's opponents (lead first) and AI level on the other.
 * The sim has no terrain setting, so the stage element is chosen by the match seed (`matchSeed`).
 */
export function stagePick(run: TourRun, stage: TourStage): ArcadePick {
  const [player, partner, partner2] = run.hero as [CharacterId, CharacterId, CharacterId];
  const [enemy, ...bench] = stage.opponents as [CharacterId, ...CharacterId[]];
  return { player, partner, partner2, enemy, enemyBench: bench, level: stage.aiLevel };
}

/**
 * The match seed of a fight: derived from the run seed, the stage and the continues spent (a retry plays a different match),
 * then moved up to the first seed whose drawn stage element is the location's. The Void's location has no terrain element, so
 * any seed will do.
 */
export function matchSeed(run: TourRun, stage: TourStage): number {
  const spent = TOUR_CONTINUES - run.continues;
  const base = (run.seed ^ Math.imul(stage.index + 1, 0x9e3779b1) ^ Math.imul(spent + 1, 0x85ebca6b)) >>> 0;
  const want = STAGE_KIND[stage.terrain];
  if (want === undefined) return base;
  for (let i = 0; i < 4096; i++) {
    const seed = (base + i) >>> 0;
    if (stageKindOfSeed(seed) === want) return seed;
  }
  return base;
}

/** The picker's three selects to a team: a known lead, then partners that repeat nobody (a repeat is replaced). */
export function parseTeam(raw: { readonly hero1?: string; readonly hero2?: string; readonly hero3?: string }): CharacterId[] {
  const first = ARCADE_RACES.find((r) => r === raw.hero1) ?? DEFAULT_PICK.player;
  const second = partnerFor(first, raw.hero2);
  return [first, second, partner2For(first, second, raw.hero3)];
}
