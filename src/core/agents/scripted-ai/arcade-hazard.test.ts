import { describe, expect, it } from 'vitest';
import { arcadePlayfield, HAZARD_GUST_H, HAZARD_LAVA_W, HAZARD_ROCK_PX, HAZARD_WARN_TICKS, RoundPhase } from '../../data/arcade';
import { characterId } from '../../data/ids';
import { getCharacter } from '../../data/characters';
import { DEFAULT_SIM_FLAGS } from '../../flags';
import { SIM_VERSION } from '../../version';
import { Cmd } from '../../sim/commands';
import { SimEventKind, type SimEvent } from '../../sim/events';
import { createMatch, type MatchSetup } from '../../sim/match';
import { ARCADE_WORLD_BASE, ArcadeW, HAZARD_BASE, HazardF } from '../../sim/state';
import { step } from '../../sim/step';
import { skipIntro } from '../../sim/systems/arcade/round-testkit';
import type { SimWorld } from '../../sim/world';
import { collectCommands, createObservationView, type ArcadeView, type FighterView, type HazardView, type ObservationView } from '../agent';
import { ArcadeTactics } from './arcade';
import { AI_EASY, AI_HARD, AI_NORMAL, ARCADE_AI_KNOBS, hazardExit, hazardKeepOut, TURTLE } from './arcade-ai';
import { ScriptedAI, scriptedProfileFor } from './index';

const PF = arcadePlayfield();
const HZ = (f: number): number => ARCADE_WORLD_BASE + HAZARD_BASE + f;

function fighter(x: number, y: number): FighterView {
  return { id: 0, x, y, w: 80, h: 80, hp: 100, maxHp: 100, flags: 1, alive: true };
}

const box = (x: number, y: number, w: number, h: number) => ({ x, y, w, h });
const lane = (x: number) => box(x, PF.y, HAZARD_LAVA_W, PF.h);
const band = (y: number) => box(PF.x, y, PF.w, HAZARD_GUST_H);
const rock = (x: number, y: number) => box(x, y, HAZARD_ROCK_PX, HAZARD_ROCK_PX);

const FREE: ArcadeView = {
  meter: 0, oppMeter: 0, selfStun: 0, oppStun: 0, freeze: 0, combo: 0, oppCombo: 0, superActive: false, superId: 0, prevCmd: 0,
  primaryAge: -1, secondaryAge: -1, phase: 1, shots: [], dashIn: 0, weatherIn: 0, chargeIn: -1, weatherCharge: 0, tagIn: 0,
  partnerPm: -1, partner2Pm: -1, rocks: [], snagSlot: -1, oppGuarding: false, oppRooted: 0, oppRootImmune: 0,
  traps: [], trapIn: 0, trapCount: 0, fireShot: false, elemKind: 0, elemIn: -1, cleanseIn: 1, selfRooted: 0, selfSlowed: false, oppSuperActive: false, hazard: undefined,
};

/** A lava lane at x 500 warning with `strikeIn` game ticks to go; ME stands in it, nearer its left edge (76 px vs 100). */
const lava = (strikeIn: number): HazardView => ({ kind: 1, ...lane(500), dir: 0, strikeIn });
const ME = fighter(496, 300);

function view(arcade: Partial<ArcadeView>, tick = 0, self = ME): ObservationView {
  return { side: 0, tick, self, opponent: fighter(1200, 300), cooldowns: [0, 0, 0, 0], matchSeed: 0, arcade: { ...FREE, ...arcade } };
}

/** The tactics layer's output for base command `cmd` with hazard `hazard` and extra view fields. */
const tactic = (level: typeof AI_EASY | typeof AI_NORMAL | typeof AI_HARD, hazard: HazardView | undefined, cmd: number, extra: Partial<ArcadeView> = {}, tick = 0): number =>
  new ArcadeTactics(level, TURTLE).apply(view({ hazard, ...extra }, tick), cmd);
/** `tactic` is unchanged by the hazard: the same output as with no hazard on the field. */
const ignores = (level: typeof AI_EASY | typeof AI_NORMAL | typeof AI_HARD, hazard: HazardView, cmd: number, extra: Partial<ArcadeView> = {}, tick = 0): void => {
  expect(tactic(level, hazard, cmd, extra, tick)).toBe(tactic(level, undefined, cmd, extra, tick));
};

describe('hazardExit (stage hazards)', () => {
  it('leaves a lava lane by its nearer side, right on a tie', () => {
    expect(hazardExit(fighter(512, 300), lane(500), PF)).toBe(Cmd.right); // right 84 px, left 92
    expect(hazardExit(fighter(500, 300), lane(500), PF)).toBe(Cmd.left); // left 80 px, right 96
    expect(hazardExit(fighter(480, 300), lane(500), PF)).toBe(Cmd.left); // left 60 px, right 116
    expect(hazardExit(fighter(508, 300), lane(500), PF)).toBe(Cmd.right); // 88 each way: right
  });

  it('leaves a gust band up or down, whichever is nearer', () => {
    expect(hazardExit(fighter(900, 400), band(380), PF)).toBe(Cmd.down); // down 100 px, up 100: down before up
    expect(hazardExit(fighter(900, 390), band(380), PF)).toBe(Cmd.up); // up 90 px, down 110
    expect(hazardExit(fighter(900, 450), band(380), PF)).toBe(Cmd.down); // down 50 px
  });

  it('leaves a rockfall square by the shortest of four ways, never past a wall', () => {
    expect(hazardExit(fighter(660, 380), rock(650, 360), PF)).toBe(Cmd.left); // left 90, up 100, down 92 (rock ends at 472, fighter at 380: 92), right 102
    expect(hazardExit(fighter(720, 400), rock(650, 360), PF)).toBe(Cmd.right); // right 42, down 72
    expect(hazardExit(fighter(700, 330), rock(650, 360), PF)).toBe(Cmd.up); // up 50, right 62
    // Down is nearest (52) but would end past the playfield bottom (640): right (62) instead.
    expect(hazardExit(fighter(700, 540), rock(650, 480), PF)).toBe(Cmd.right);
    // In the top-left corner left and up are past the walls; right and down tie at 112: right.
    expect(hazardExit(fighter(0, PF.y), rock(0, PF.y), PF)).toBe(Cmd.right);
  });

  it('is 0 outside the box and for a tide (its box is the whole field: no way out fits)', () => {
    expect(hazardExit(fighter(100, 300), lane(500), PF)).toBe(0);
    expect(hazardExit(fighter(596, 300), lane(500), PF)).toBe(0); // touching the right edge is out
    expect(hazardExit(fighter(900, 300), PF, PF)).toBe(0);
  });
});

describe('hazardKeepOut (stage hazards)', () => {
  it('drops a step that would enter the box and keeps the others', () => {
    const left = fighter(400, 300); // its right edge at 480, 20 px left of the lane
    expect(hazardKeepOut(fighter(410, 300), lane(500), Cmd.right)).toBe(0);
    expect(hazardKeepOut(fighter(410, 300), lane(500), Cmd.right | Cmd.up)).toBe(Cmd.up);
    expect(hazardKeepOut(left, lane(500), Cmd.left | Cmd.down)).toBe(Cmd.left | Cmd.down);
    expect(hazardKeepOut(fighter(900, 300), lane(500), Cmd.left)).toBe(Cmd.left); // far from it
  });

  it('drops the vertical step too when only the diagonal enters (a rockfall corner)', () => {
    const r = rock(600, 400);
    // Up-left of the square's top-left corner, just clear on both axes: each axis alone stays out, the diagonal enters.
    const me = fighter(600 - 80 - 4, 400 - 80 - 4);
    expect(hazardKeepOut(me, r, Cmd.right)).toBe(Cmd.right);
    expect(hazardKeepOut(me, r, Cmd.down)).toBe(Cmd.down);
    expect(hazardKeepOut(me, r, Cmd.right | Cmd.down)).toBe(Cmd.right);
  });

  it('leaves the move alone from inside the box', () => {
    expect(hazardKeepOut(ME, lane(500), Cmd.right | Cmd.down)).toBe(Cmd.right | Cmd.down);
  });
});

describe('ArcadeTactics hazard dodge (stage hazards)', () => {
  const NORMAL_READY = HAZARD_WARN_TICKS - ARCADE_AI_KNOBS[AI_NORMAL][0];

  it('walks out of a warned lane once the level has reacted, attacks riding along', () => {
    expect(tactic(AI_NORMAL, lava(NORMAL_READY), Cmd.right | Cmd.primary)).toBe(Cmd.left | Cmd.primary);
    expect(tactic(AI_HARD, lava(HAZARD_WARN_TICKS - ARCADE_AI_KNOBS[AI_HARD][0]), Cmd.up)).toBe(Cmd.left);
  });

  it('does not react before its reaction time, nor once the hazard is active', () => {
    ignores(AI_NORMAL, lava(NORMAL_READY + 1), Cmd.right);
    ignores(AI_NORMAL, lava(0), Cmd.right);
  });

  it('Easy is blind in the second half of every 256 ticks', () => {
    const late = HAZARD_WARN_TICKS - ARCADE_AI_KNOBS[AI_EASY][0];
    expect(tactic(AI_EASY, lava(late), Cmd.right, {}, 0)).toBe(Cmd.left);
    ignores(AI_EASY, lava(late), Cmd.right, {}, 128);
  });

  it('leaves guard and dash commands, a rooted or stunned fighter and a non-fight phase alone', () => {
    const hz = lava(1);
    expect(tactic(AI_HARD, hz, Cmd.right)).toBe(Cmd.left);
    ignores(AI_HARD, hz, Cmd.guard);
    ignores(AI_HARD, hz, Cmd.dash | Cmd.right);
    ignores(AI_HARD, hz, Cmd.right, { selfRooted: 30 });
    ignores(AI_HARD, hz, Cmd.right, { selfStun: 10 });
    ignores(AI_HARD, hz, Cmd.right, { phase: RoundPhase.intro });
  });

  it('outside the box it only stops a step back in; a tide changes nothing', () => {
    const near = new ArcadeTactics(AI_HARD, TURTLE).apply(view({ hazard: lava(1) }, 0, fighter(410, 300)), Cmd.right | Cmd.down);
    expect(near).toBe(Cmd.down);
    const tide: HazardView = { kind: 2, ...PF, dir: 1, strikeIn: 1 };
    ignores(AI_HARD, tide, Cmd.right | Cmd.primary);
  });
});

/** p1 (id 0, fiara) against an idle p2 (id 1, pax) in the fight on stage `stage`, with no patches. */
function duel(stage: number): SimWorld {
  const setup: MatchSetup = {
    simVersion: SIM_VERSION, seed: 9, flags: { ...DEFAULT_SIM_FLAGS, rulesetArcade: true }, chapter: 1, difficulty: 1,
    p1: [{ character: characterId('fiara'), xp: 1 }],
    p2: [{ character: characterId('pax'), xp: 1 }],
  };
  const world = skipIntro(createMatch(setup));
  const s = world.state;
  s.arcade[ARCADE_WORLD_BASE + ArcadeW.stage] = stage;
  s.arcade[ARCADE_WORLD_BASE + ArcadeW.patchCount] = 0;
  s.x[0] = 300; s.y[0] = 300;
  s.x[1] = 1500; s.y[1] = 300;
  return world;
}

function toWarn(world: SimWorld): void {
  for (let i = 0; i < 3000; i++) {
    if (step(world, [0, 0]).some((e) => e.kind === SimEventKind.hazardWarn)) return;
  }
  throw new Error('no hazard warning');
}

describe('ObservationView.arcade.hazard', () => {
  it('is undefined with no live hazard, and shows the box and the game ticks to the strike while one warns', () => {
    // The first view after the warning tick is one game tick into the warning.
    const world = duel(1);
    expect(createObservationView(world, 0).arcade?.hazard).toBeUndefined();
    toWarn(world);
    const a = world.state.arcade;
    const hz = createObservationView(world, 1).arcade?.hazard;
    expect(hz).toEqual({
      kind: 1, x: a[HZ(HazardF.x)], y: a[HZ(HazardF.y)], w: HAZARD_LAVA_W, h: a[HZ(HazardF.h)], dir: a[HZ(HazardF.dir)],
      strikeIn: HAZARD_WARN_TICKS - 1,
    });
  });
});

describe('scripted AI against a real hazard (stage hazards)', () => {
  // A lava lane only: under a rockfall the base AI's own walking and charging usually leaves the square anyway.
  it.each([AI_NORMAL, AI_HARD] as const)('level %i: a fighter put in a warned lava lane walks out before the strike', (level) => {
    const world = duel(1);
    toWarn(world);
    const s = world.state;
    const a = s.arcade;
    const hx = a[HZ(HazardF.x)] ?? 0;
    const hy = a[HZ(HazardF.y)] ?? 0;
    const hw = a[HZ(HazardF.w)] ?? 0;
    const hh = a[HZ(HazardF.h)] ?? 0;
    // Mid-lane, with the foe straight above or below, so walking at it alone stays in the lane (the base AI is hit then).
    s.x[0] = hx + Math.trunc(hw / 2) - 40;
    s.y[0] = hy + Math.trunc(hh / 2) - 40;
    s.x[1] = s.x[0];
    s.y[1] = s.y[0] < PF.y + PF.h / 2 ? PF.y + PF.h - 80 : PF.y;
    const hp = s.hp[0];
    const ai = new ScriptedAI(scriptedProfileFor(getCharacter(characterId('fiara')), getCharacter(characterId('pax'))), { id: 'p1', level, personality: TURTLE });
    let evs: SimEvent[] = [];
    // Until the strike (hit-stops from its own attacks pause the game clock, so it can take more than HAZARD_WARN_TICKS steps).
    for (let i = 0; i < 4 * HAZARD_WARN_TICKS && !evs.some((e) => e.kind === SimEventKind.hazardStrike); i++) {
      evs = evs.concat(step(world, collectCommands(world, [ai, undefined])));
    }
    expect(evs.filter((e) => e.kind === SimEventKind.hazardStrike)).toHaveLength(1);
    expect(evs.filter((e) => e.kind === SimEventKind.hazardHit && e.team === 0)).toHaveLength(0);
    expect(s.hp[0]).toBe(hp);
  });
});
