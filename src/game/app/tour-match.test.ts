import { describe, expect, it } from 'vitest';
import { ARCADE_WORLD_BASE, ArcadeW, Cmd, ROUND_INTRO_TICKS, collectCommands, createMatch, step, type Agent, type AgentState, type CharacterId, type ObservationView } from '@core/index';
import { arcadeEnemy, arcadeSetup } from './arcade-setup';
import { ARCADE_RACES } from './arcade-pick';
import { OPENING_NEAR_PX, OPENING_TICKS, openingRush, seedForStage, matchSeed, parseCompleteTeam, parseTeam, stageKindOfSeed, stagePick, tourFight } from './tour-match';
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

describe('parseCompleteTeam', () => {
  it('accepts a full team and rejects any empty, missing or unknown slot', () => {
    expect(parseCompleteTeam({ hero1: 'fiara', hero2: 'rokcore', hero3: 'curomo' })).toEqual(HERO);
    for (const raw of [{ hero1: 'fiara', hero2: '', hero3: 'curomo' }, { hero1: 'fiara', hero2: 'rokcore' }, { hero1: '__proto__', hero2: 'rokcore', hero3: 'curomo' }, {}]) {
      expect(parseCompleteTeam(raw)).toBeUndefined();
    }
  });
});

describe('seedForStage', () => {
  const KINDS = { fire: 1, water: 2, earth: 3, air: 4 } as const;
  it('returns a seed whose drawn stage is the chosen element, deterministically', () => {
    for (const [name, kind] of Object.entries(KINDS)) {
      for (const base of [0, 1, 12345, 0xffffffff]) {
        const s = seedForStage(base, name);
        expect(stageKindOfSeed(s)).toBe(kind);
        expect(seedForStage(base, name)).toBe(s);
      }
    }
  });
  it('leaves a seed that already draws the stage untouched, and an unknown stage alone', () => {
    const s = 777;
    const name = ['', 'fire', 'water', 'earth', 'air'][stageKindOfSeed(s)] as string;
    expect(seedForStage(s, name)).toBe(s);
    expect(seedForStage(s, 'random')).toBe(s);
    expect(seedForStage(s, '')).toBe(s);
  });
});

describe('openingRush (QA r122 stage 1 dead walk)', () => {
  const MOVE = Cmd.up | Cmd.down | Cmd.left | Cmd.right;
  /** An inner agent that always issues `cmd`, counting observes and recording loads. */
  function stub(cmd: number): Agent & { calls: number; loaded: AgentState[] } {
    const a = {
      id: 'stub', calls: 0, loaded: [] as AgentState[],
      observe: () => { a.calls++; return cmd; },
      save: (): AgentState => ({ calls: a.calls }),
      load: (st: AgentState) => { a.loaded.push(st); },
    };
    return a;
  }
  const fighter = (x: number) => ({ id: 0, x, y: 400, w: 80, h: 80, hp: 1, maxHp: 1, flags: 0, alive: true });
  function view(gap: number, phase = 1, dashIn = 0): ObservationView {
    return { side: 1, tick: 0, self: fighter(1000), opponent: fighter(1000 - gap), cooldowns: [], matchSeed: 0, arcade: { phase, dashIn } as unknown as ObservationView['arcade'] };
  }

  it('observes the inner agent every tick and delegates outside the fight phase', () => {
    const inner = stub(Cmd.primary);
    const rush = openingRush(inner);
    expect(rush.observe(view(800, 0), 1)).toBe(Cmd.primary);
    expect(rush.observe(view(800, 2), 2)).toBe(Cmd.primary);
    expect(inner.calls).toBe(2);
  });

  it('walks toward the foe with a dash edge, keeps the inner non-move bits, and never dashes on consecutive ticks', () => {
    const rush = openingRush(stub(Cmd.primary));
    const a = rush.observe(view(800), 1);
    expect(a & MOVE).toBe(Cmd.left);
    expect(a & Cmd.dash).toBe(Cmd.dash);
    expect(a & Cmd.primary).toBe(Cmd.primary);
    expect(rush.observe(view(800), 2) & Cmd.dash).toBe(0);
    expect(rush.observe(view(800), 3) & Cmd.dash).toBe(Cmd.dash);
  });

  it('does not dash while the dash cools down, and the inner move bits win when it has any', () => {
    expect(openingRush(stub(0)).observe(view(800, 1, 12), 1) & Cmd.dash).toBe(0);
    const c = openingRush(stub(Cmd.up)).observe(view(800), 1);
    expect(c & MOVE).toBe(Cmd.up);
    expect(c & Cmd.dash).toBe(0);
  });

  it('disarms at the near gap and after the window, and re-arms on the next round', () => {
    const near = openingRush(stub(0));
    expect(near.observe(view(OPENING_NEAR_PX), 1)).toBe(0);
    expect(near.observe(view(800), 2)).toBe(0);
    near.observe(view(800, 2), 3);
    expect(near.observe(view(800), 4) & MOVE).toBe(Cmd.left);

    const rush = openingRush(stub(0));
    for (let i = 0; i < OPENING_TICKS; i++) rush.observe(view(800), i);
    expect(rush.observe(view(800), OPENING_TICKS)).toBe(0);
    rush.observe(view(800, 2), OPENING_TICKS + 1);
    expect(rush.observe(view(800), OPENING_TICKS + 2) & MOVE).toBe(Cmd.left);
  });

  it('saves and loads its window and the inner state', () => {
    const rush = openingRush(stub(0));
    for (let i = 0; i < 40; i++) rush.observe(view(800), i);
    const saved = rush.save();
    const inner2 = stub(0);
    const copy = openingRush(inner2);
    copy.load(saved);
    expect(inner2.loaded).toEqual([{ calls: 40 }]);
    for (let i = 0; i < 40; i++) {
      expect(copy.observe(view(800), 40 + i)).toBe(rush.observe(view(800), 40 + i));
    }
  });

  /** Ticks after the round intro until the idle player's lead and the foe are within OPENING_NEAR_PX (x gap), or -1. */
  function ticksToContact(wrapped: boolean): number {
    const fight = tourFight(startRun(HERO, 5));
    expect(fight.stage.index).toBe(0);
    const setup = arcadeSetup(fight.pick, fight.seed);
    const world = createMatch(setup);
    const foe = wrapped ? openingRush(arcadeEnemy(fight.pick, setup)) : arcadeEnemy(fight.pick, setup);
    const idle: Agent = { id: 'idle', observe: () => 0, save: () => null, load: () => undefined };
    for (let t = 0; t < ROUND_INTRO_TICKS + 400; t++) {
      step(world, collectCommands(world, [idle, foe]));
      const p1 = world.state.x[0] ?? 0;
      const p2 = world.state.x[setup.p1.length] ?? 0;
      if (t > ROUND_INTRO_TICKS && Math.abs(p2 - p1) <= OPENING_NEAR_PX) return t - ROUND_INTRO_TICKS;
    }
    return -1;
  }

  it('closes the stage 1 gap sooner than the plain Easy AI against an idle player', () => {
    const plain = ticksToContact(false);
    const rushed = ticksToContact(true);
    expect(rushed).toBeGreaterThan(0);
    expect(rushed).toBeLessThanOrEqual(130);
    expect(plain === -1 || plain > rushed + 30).toBe(true);
  });
});
