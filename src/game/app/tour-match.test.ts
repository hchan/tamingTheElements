import { describe, expect, it } from 'vitest';
import { ARCADE_WORLD_BASE, ArcadeW, createMatch, step, type CharacterId } from '@core/index';
import { arcadeSetup } from './arcade-setup';
import { ARCADE_RACES } from './arcade-pick';
import { matchSeed, parseTeam, stageKindOfSeed, stagePick } from './tour-match';
import { advance, buildTour, startRun, useContinue, type TourStage } from './tour-model';

const HERO = ['fiara', 'rokcore', 'curomo'] as CharacterId[];
const KIND = { fire: 1, water: 2, earth: 3, air: 4 } as const;
const kindOf = (s: TourStage): number => KIND[s.terrain as keyof typeof KIND];

describe('stagePick', () => {
  it('puts the hero team on one side and the stage roster and level on the other', () => {
    const run = startRun(HERO, 3);
    const stage = buildTour(HERO, 3)[0] as TourStage;
    const pick = stagePick(run, stage);
    expect(pick).toMatchObject({ player: 'fiara', partner: 'rokcore', partner2: 'curomo', level: 'easy', enemy: stage.opponents[0] });
    expect([pick.enemy, ...(pick.enemyBench ?? [])]).toEqual(stage.opponents);
    const setup = arcadeSetup(pick, 1);
    expect(setup.p1.map((m) => m.character)).toEqual(HERO);
    expect(setup.p2.map((m) => m.character)).toEqual(stage.opponents);
  });

  it('the Void fight is the three heroes against the lone boss', () => {
    const stage = buildTour(HERO, 3)[8] as TourStage;
    expect(arcadeSetup(stagePick(startRun(HERO, 3), stage), 1).p2.map((m) => m.character)).toEqual(['eternal-void']);
  });
});

describe('matchSeed', () => {
  it('is deterministic, varies with the retry, and draws the location as the stage element', () => {
    for (let seed = 0; seed < 6; seed++) {
      for (const stage of buildTour(HERO, seed).slice(0, 8)) {
        const run = { ...startRun(HERO, seed), stage: stage.index };
        const ms = matchSeed(run, stage);
        expect(matchSeed(run, stage)).toBe(ms);
        expect(stageKindOfSeed(ms)).toBe(kindOf(stage));
      }
    }
    const run = startRun(HERO, 9);
    const stage = buildTour(HERO, 9)[0] as TourStage;
    expect(matchSeed(useContinue(advance(run, false)), stage)).not.toBe(matchSeed(run, stage));
  });

  it('really is the stage the Arcade sim picks in round 1', () => {
    const run = startRun(HERO, 21);
    const stage = buildTour(HERO, 21)[2] as TourStage;
    const world = createMatch(arcadeSetup(stagePick(run, stage), matchSeed(run, stage)));
    step(world, [0, 0]);
    expect(world.state.arcade[ARCADE_WORLD_BASE + ArcadeW.stage]).toBe(kindOf(stage));
  });
});

describe('parseTeam', () => {
  it('keeps three different known heroes and replaces repeats and unknowns', () => {
    expect(parseTeam({ hero1: 'fiara', hero2: 'rokcore', hero3: 'curomo' })).toEqual(HERO);
    for (const t of [parseTeam({ hero1: 'fiara', hero2: 'fiara', hero3: 'fiara' }), parseTeam({ hero1: '__proto__' }), parseTeam({})]) {
      expect(new Set(t).size).toBe(3);
      for (const h of t) expect(ARCADE_RACES).toContain(h);
    }
  });
});
