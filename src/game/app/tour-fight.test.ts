import { describe, expect, it } from 'vitest';
import { ARCADE_WORLD_BASE, ArcadeW, createMatch, step, type CharacterId } from '@core/index';
import { arcadeSetup } from './arcade-setup';
import { currentStage, matchSeed, stagePick } from './tour-match';
import { TOUR_STAGES, advance, buildTour, startRun, useContinue, type TourRun } from './tour-model';

/**
 * QA r67 compared a Tour card and splash from two different launches (a fresh seed each). This pins that, for one run, the stage the
 * card/splash read (`currentStage`) is the fight the sim really starts: same hero team, same opponents, same round-1 arena element,
 * for every stage and every continue count.
 */
const TEAMS = [
  ['sindarosa', 'pax', 'curomo'],
  ['fiara', 'rokcore', 'curomo'],
  ['curomo', 'pax', 'wispera'],
] as CharacterId[][];
const SEEDS = [0, 5, 21, 0xffffffff];
const KIND = { fire: 1, water: 2, earth: 3, air: 4 } as const;

/** Asserts that the card source equals the fight for `run`; returns the match seed. */
function checkFight(run: TourRun): number {
  const stage = currentStage(run);
  expect(stage).toEqual(buildTour(run.hero, run.seed)[run.stage]);
  const seed = matchSeed(run, stage);
  const setup = arcadeSetup(stagePick(run, stage), seed);
  expect(setup.p1.map((m) => m.character)).toEqual(run.hero);
  expect(setup.p2.map((m) => m.character)).toEqual(stage.opponents);
  const world = createMatch(setup);
  step(world, [0, 0]);
  const kind = world.state.arcade[ARCADE_WORLD_BASE + ArcadeW.stage] as number;
  if (run.stage === TOUR_STAGES - 1) {
    expect(stage.location).toBe('void');
    expect(stage.opponents).toEqual(['eternal-void']);
    // the sim has no void floor yet, so it is a random element (ideas/brainstorm/tour-void-floor.md)
    expect(kind).toBeGreaterThanOrEqual(1);
    expect(kind).toBeLessThanOrEqual(4);
  } else {
    expect(kind).toBe(KIND[stage.terrain as keyof typeof KIND]);
  }
  return seed;
}

describe('tour card == fight', () => {
  it('every stage and continue count starts the fight the card shows', () => {
    for (const team of TEAMS) {
      for (const seed of SEEDS) {
        const ladder = buildTour(team, seed);
        for (let i = 0; i < TOUR_STAGES; i++) {
          const base = startRun(team, seed);
          const seeds = [3, 2, 1, 0].map((c) => {
            const run: TourRun = { ...base, stage: i, continues: c };
            expect(currentStage(run)).toEqual(ladder[i]);
            return checkFight(run);
          });
          // a continue re-rolls the match seed, never the stage
          expect(seeds[0]).not.toBe(seeds[1]);
        }
      }
    }
  });

  it('holds along a real playthrough with a loss and a continue', () => {
    let run = startRun(TEAMS[0] as CharacterId[], 42);
    checkFight(run);
    for (let i = 0; i < 3; i++) {
      run = advance(run, true);
      checkFight(run);
    }
    run = useContinue(advance(run, false));
    checkFight(run);
    while (run.stage < TOUR_STAGES - 1) {
      run = advance(run, true);
      checkFight(run);
    }
    expect(run.stage).toBe(TOUR_STAGES - 1);
  });
});
