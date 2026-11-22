import { describe, expect, it } from 'vitest';
import { arcadePlayfield } from '../../data/arcade';
import { characterId } from '../../data/ids';
import { getCharacter } from '../../data/characters';
import { DEFAULT_SIM_FLAGS } from '../../flags';
import { Cmd, type Command } from '../../sim/commands';
import { createMatch, type MatchSetup } from '../../sim/match';
import { step } from '../../sim/step';
import { createObservationView, type ArcadeView, type FighterView, type ObservationView } from '../agent';
import { ArcadeTactics } from './arcade';
import { AI_EASY, AI_HARD, AI_NORMAL, ARCADE_AI_EASY_OPENING_MASK, ARCADE_AI_EASY_OPENING_TICKS, RUSHDOWN, type ArcadeAiLevel } from './arcade-ai';
import { ScriptedAI, scriptedProfileFor } from './index';

/** Easy opening grace (SIM_VERSION 97, QA r110 #12): Easy drops offensive bits for 175 ticks after each round's FIGHT. */

const OPEN = ARCADE_AI_EASY_OPENING_TICKS;
const fighter = (x: number, hp: number): FighterView => ({ id: 0, x, y: 300, w: 80, h: 80, hp, maxHp: 1000, flags: 0, alive: true });
const FREE: ArcadeView = {
  meter: 0, oppMeter: 0, selfStun: 0, oppStun: 0, freeze: 0, combo: 0, oppCombo: 0, superActive: false, superId: 0, prevCmd: 0,
  primaryAge: -1, secondaryAge: -1, phase: 1, shots: [], dashIn: 0, weatherIn: 0, chargeIn: -1, weatherCharge: 1000, tagIn: 0, partnerPm: -1, partner2Pm: -1, rocks: [],
  snagSlot: -1, oppGuarding: false, oppRooted: 0, oppRootImmune: 0, traps: [], trapIn: 0, trapCount: 0, fireShot: false, elemKind: 0, elemIn: -1, cleanseIn: 1, selfRooted: 0, selfSlowed: false, oppSuperActive: false, hazard: undefined,
};
const PF = arcadePlayfield();

function view(tick: number, phase: number, hp = 1000): ObservationView {
  return {
    side: 0, tick, self: fighter(PF.x + 200, hp), opponent: fighter(PF.x + 330, 1000), cooldowns: [0, 0, 0, 0], matchSeed: 0,
    arcade: { ...FREE, phase },
  };
}

/** The offensive bits an agent emits per fight tick (first fight tick = `from`). */
function fightBits(t: ArcadeTactics, from: number, ticks: number, hpAt: (tick: number) => number = () => 1000): Command[] {
  const out: Command[] = [];
  for (let i = 0; i < ticks; i++) out.push(t.apply(view(from + i, 1, hpAt(from + i)), Cmd.primary | Cmd.secondary) & ARCADE_AI_EASY_OPENING_MASK);
  return out;
}
const intro = (t: ArcadeTactics, ticks = 71): void => {
  for (let i = 0; i < ticks; i++) t.apply(view(i, 0), 0);
};
const fresh = (level: ArcadeAiLevel): ArcadeTactics => new ArcadeTactics(level, RUSHDOWN, false, ['none', 'none']);

describe('Easy opening grace', () => {
  it('Easy emits no offensive bit for the first OPENING fight ticks, then attacks; Normal and Hard attack at once', () => {
    const easy = fresh(AI_EASY);
    intro(easy);
    const bits = fightBits(easy, 71, OPEN + 40);
    expect(bits.slice(0, OPEN).every((b) => b === 0)).toBe(true);
    expect(bits.slice(OPEN).some((b) => b !== 0)).toBe(true);
    for (const level of [AI_NORMAL, AI_HARD] as const) {
      const t = fresh(level);
      intro(t);
      expect(fightBits(t, 71, 20).some((b) => b !== 0)).toBe(true);
    }
  });

  it('a hit on the AI hero ends the grace on that tick', () => {
    const t = fresh(AI_EASY);
    intro(t);
    const bits = fightBits(t, 71, 60, (tick) => (tick >= 100 ? 900 : 1000));
    expect(bits.slice(0, 29).every((b) => b === 0)).toBe(true);
    expect(bits.slice(29).some((b) => b !== 0)).toBe(true);
  });

  it('a first observation already in the fight gets no grace; a new round gets one', () => {
    const late = fresh(AI_EASY);
    expect(fightBits(late, 500, 10).some((b) => b !== 0)).toBe(true);
    const t = fresh(AI_EASY);
    fightBits(t, 500, 5); // no grace here
    for (let i = 0; i < 20; i++) t.apply(view(505 + i, 2), 0); // KO and round end
    expect(fightBits(t, 525, OPEN).every((b) => b === 0)).toBe(true);
  });

  it('save then load mid-grace continues the same grace', () => {
    const t = fresh(AI_EASY);
    intro(t);
    fightBits(t, 71, 100);
    const copy = fresh(AI_EASY);
    copy.load(JSON.parse(JSON.stringify(t.save())) as ReturnType<ArcadeTactics['save']>);
    const rest = fightBits(copy, 171, OPEN - 100 + 30);
    expect(rest.slice(0, OPEN - 100).every((b) => b === 0)).toBe(true);
    expect(rest.slice(OPEN - 100).some((b) => b !== 0)).toBe(true);
  });
});

function setup(seed: number): MatchSetup {
  return {
    simVersion: 1, seed, flags: { ...DEFAULT_SIM_FLAGS, rulesetArcade: true }, chapter: 1, difficulty: 1,
    p1: [{ character: characterId('sindarosa'), xp: 1 }],
    p2: [{ character: characterId('wispera'), xp: 1 }],
  };
}

/** HP the idle hero (side 0) has lost OPEN ticks after the first fight tick, against a scripted Wispera. */
function idleLoss(seed: number, level: ArcadeAiLevel): number {
  const world = createMatch(setup(seed));
  const ai = new ScriptedAI(scriptedProfileFor(getCharacter(characterId('wispera')), getCharacter(characterId('sindarosa'))), { id: 'b', level, personality: RUSHDOWN });
  const hp0 = createObservationView(world, 0).self?.hp ?? 0;
  let fightAt = -1;
  for (let i = 0; i < 71 + OPEN + 120; i++) {
    const v0 = createObservationView(world, 0);
    if (fightAt < 0 && v0.arcade?.phase === 1) fightAt = i;
    if (fightAt >= 0 && i === fightAt + OPEN - 1) return hp0 - (v0.self?.hp ?? 0);
    step(world, [0, ai.observe(createObservationView(world, 1))]);
  }
  return -1;
}

describe('Easy opening grace over a whole match (idle Sindarosa vs scripted Wispera)', () => {
  const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
  it('Easy: the idle hero loses nothing in the opening window', () => {
    for (const seed of SEEDS) expect(idleLoss(seed, AI_EASY)).toBe(0);
  });
  it('Normal: the idle hero is hit in the same window on most seeds (so the test is not vacuous)', () => {
    expect(SEEDS.filter((s) => idleLoss(s, AI_NORMAL) > 0).length).toBeGreaterThanOrEqual(4);
  });
});
