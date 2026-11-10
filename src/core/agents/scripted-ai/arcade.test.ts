import { describe, expect, it } from 'vitest';
import { SUPER_CHORD_TICKS, SUPER_COST } from '../../data/arcade';
import { characterId } from '../../data/ids';
import { DEFAULT_SIM_FLAGS } from '../../flags';
import { Cmd } from '../../sim/commands';
import { hash } from '../../sim/hash';
import { createMatch, type MatchSetup } from '../../sim/match';
import { skipIntro } from '../../sim/systems/arcade/round-testkit';
import { ARCADE_E, ARCADE_T, ARCADE_TEAM_BASE, ARCADE_WORLD_BASE, ArcadeE, ArcadeT, ArcadeW, World } from '../../sim/state';
import { allocEntity } from '../../sim/alloc';
import { step } from '../../sim/step';
import { createObservationView, type AgentState, type ArcadeView, type FighterView, type ObservationView, type ShotView } from '../agent';
import { getCharacter } from '../../data/characters';
import { collectCommands } from '../agent';
import { EntityFlag, EntityKind, MAX_ENTITIES, countIdx } from '../../sim/state';
import { SimEventKind } from '../../sim/events';
import { controlledId } from '../../sim/systems/movement';
import { ARCADE_AI_SLIDE_TICKS, ARCADE_AI_STALE_TICKS, ArcadeTactics, avoidChord, diagonalLine, pressStep, sidestep, superFacing } from './arcade';
import {
  AI_EASY, AI_HARD, AI_NORMAL, ARCADE_AI_COMBO_CAP, ARCADE_AI_DODGE_AT, ARCADE_AI_GUARD_AT, ARCADE_AI_KNOBS,
  ARCADE_AI_LOOKAHEAD, ARCADE_AI_REACTION_MIN, ARCADE_AI_SIDESTEP_AT, ARCADE_AI_REACTION_SPREAD, DODGE, GUARD, NO_PLAN, PARRY, RUSHDOWN, TURTLE,
  ZONER, impactIn, toward,
} from './arcade-ai';
import { ScriptedAI, scriptedProfileFor } from './index';

const SETUP: MatchSetup = {
  simVersion: 1,
  seed: 11,
  flags: DEFAULT_SIM_FLAGS,
  chapter: 1,
  difficulty: 1,
  p1: [{ character: characterId('sindarosa'), xp: 1 }],
  p2: [{ character: characterId('lavax'), xp: 1 }],
};

function fighter(x: number, y: number, flags = 1): FighterView {
  return { id: 0, x, y, w: 80, h: 80, hp: 100, maxHp: 100, flags, alive: true };
}

const FREE: ArcadeView = {
  meter: 0, oppMeter: 0, selfStun: 0, oppStun: 0, freeze: 0, combo: 0, oppCombo: 0, superActive: false, superId: 0, prevCmd: 0,
  primaryAge: -1, secondaryAge: -1, phase: 1, shots: [], dashIn: 0, weatherIn: 0, chargeIn: -1, weatherCharge: 1000, tagIn: 0, partnerPm: -1, rocks: [],
};

function view(arcade: Partial<ArcadeView> | undefined, tick = 0, self = fighter(200, 300), opp = fighter(700, 300)): ObservationView {
  return {
    side: 0, tick, self, opponent: opp, cooldowns: [0, 0, 0, 0], matchSeed: 0,
    ...(arcade !== undefined && { arcade: { ...FREE, ...arcade } }),
  };
}

/** A shot `ticks` game ticks from hitting the default `self` (fighter(200, 300)), flying left along its row at 8 px per tick. */
function shotIn(ticks: number): ShotView {
  return { x: 279 + 8 * ticks, y: 330, w: 20, h: 20, vx: -8, vy: 0 };
}

/** The memory part of `ArcadeTactics.save()`. */
const mem = (t: ArcadeTactics): number[] => (t.save() as { mem: number[] }).mem;

describe('ObservationView.arcade', () => {
  it('is absent in Classic', () => {
    expect('arcade' in createObservationView(createMatch(SETUP), 0)).toBe(false);
  });

  it('copies the visible Arcade state per side and never changes the world (a fresh match is in the intro, phase 0)', () => {
    const world = createMatch({ ...SETUP, flags: { ...DEFAULT_SIM_FLAGS, rulesetArcade: true } });
    const s = world.state;
    const v0 = createObservationView(world, 0);
    const self = v0.self?.id ?? -1;
    const opp = v0.opponent?.id ?? -1;
    const g = s.arcade[ARCADE_WORLD_BASE + ArcadeW.gameTick] ?? 0;
    const t = (team: number, f: number): number => ARCADE_TEAM_BASE + team * ARCADE_T + f;
    s.arcade[t(0, ArcadeT.meter)] = 1200;
    s.arcade[t(1, ArcadeT.meter)] = 300;
    s.arcade[t(0, ArcadeT.comboHits)] = 2;
    s.arcade[t(0, ArcadeT.superState)] = 9;
    s.arcade[opp * ARCADE_E + ArcadeE.stunUntil] = g + 14;
    s.arcade[self * ARCADE_E + ArcadeE.stunUntil] = g - 3;
    s.arcade[ARCADE_WORLD_BASE + ArcadeW.freezeUntil] = (s.world[World.tick] ?? 0) + 6;
    s.arcade[t(0, ArcadeT.prevCmd)] = Cmd.primary;
    s.arcade[t(0, ArcadeT.pressTick)] = g + 1 - 2;
    s.arcade[self * ARCADE_E + ArcadeE.dashReadyAt] = g + 9;
    s.arcade[opp * ARCADE_E + ArcadeE.weatherReadyAt] = g + 700;
    // An enemy (team 1) projectile and an own one: side 0 sees only the first, side 1 only the second.
    const shot = (team: number, x: number, vx: number): number => {
      const id = allocEntity(s);
      s.kind[id] = EntityKind.projectile;
      s.team[id] = team;
      s.x[id] = x; s.y[id] = 330; s.w[id] = 20; s.h[id] = 20; s.vx[id] = vx;
      return id;
    };
    shot(1, 600, -8);
    shot(0, 300, 8);
    const before = hash(s);
    expect(createObservationView(world, 0).arcade).toEqual({
      meter: 1200, oppMeter: 300, selfStun: 0, oppStun: 14, freeze: 6, combo: 2, oppCombo: 0, superActive: true, superId: 1,
      prevCmd: Cmd.primary, primaryAge: 2, secondaryAge: -1, phase: 0,
      shots: [{ x: 600, y: 330, w: 20, h: 20, vx: -8, vy: 0 }], dashIn: 9, weatherIn: 0, chargeIn: -1, weatherCharge: 0, tagIn: 0, partnerPm: -1, rocks: [],
    });
    expect(createObservationView(world, 1).arcade).toEqual({
      meter: 300, oppMeter: 1200, selfStun: 14, oppStun: 0, freeze: 6, combo: 0, oppCombo: 2, superActive: false, superId: 2,
      prevCmd: 0, primaryAge: -1, secondaryAge: -1, phase: 0,
      shots: [{ x: 300, y: 330, w: 20, h: 20, vx: 8, vy: 0 }], dashIn: 0, weatherIn: 700, chargeIn: -1, weatherCharge: 0, tagIn: 0, partnerPm: -1, rocks: [],
    });
    expect(hash(s)).toBe(before);
  });
});

describe('ArcadeTactics: confirms, supers and combo caps', () => {
  const cmd = Cmd.primary | Cmd.left;

  it('returns the Classic command untouched and never seeds its stream without view.arcade', () => {
    const t = new ArcadeTactics();
    for (const tick of [0, 1, 2]) expect(t.apply(view(undefined, tick), cmd)).toBe(cmd);
    expect(t.save()).toEqual({ mem: [-1, 0, -1, 0, NO_PLAN, 0, -1, 0, 0, 0, 0], rng: null });
  });

  it('leaves the command alone while the opponent is free and nothing threatens (a given Zoner draws nothing)', () => {
    const t = new ArcadeTactics(AI_NORMAL, ZONER);
    expect(t.apply(view({}), cmd)).toBe(cmd);
    expect(t.save()).toEqual({ mem: [-1, 0, -1, 0, NO_PLAN, 0, ZONER, 0, 0, 0, 200], rng: null });
    // Easy keeps its bar for a confirm: no free super, no draw.
    const easy = new ArcadeTactics(AI_EASY, ZONER);
    expect(easy.apply(view({ meter: SUPER_COST }), cmd)).toBe(cmd);
    expect(easy.save()).toEqual({ mem: [-1, 0, -1, 0, NO_PLAN, 0, ZONER, 0, 0, 0, 200], rng: null });
  });

  it('supers on a confirm with a full bar after its drawn reaction delay, facing the opponent', () => {
    expect(ARCADE_AI_KNOBS[AI_NORMAL].slice(0, 2)).toEqual([ARCADE_AI_REACTION_MIN, ARCADE_AI_REACTION_SPREAD]);
    const t = new ArcadeTactics(AI_NORMAL, ZONER);
    const stunned = { meter: SUPER_COST, oppStun: 20 };
    expect(t.apply(view(stunned, 100), cmd) & Cmd.super).toBe(0);
    const delay = mem(t)[1] ?? 0;
    expect(delay).toBeGreaterThanOrEqual(ARCADE_AI_REACTION_MIN);
    expect(delay).toBeLessThan(ARCADE_AI_REACTION_MIN + ARCADE_AI_REACTION_SPREAD);
    expect(t.apply(view(stunned, 100 + delay - 1), cmd) & Cmd.super).toBe(0);
    expect(t.apply(view(stunned, 100 + delay), cmd)).toBe(Cmd.super | Cmd.right);
  });

  it('does not super without the meter, while stunned, casting, recovering, off the band, or on Easy', () => {
    const late = 100;
    const no = (a: Partial<ArcadeView>, self?: FighterView, opp?: FighterView, level: 0 | 1 | 2 = AI_NORMAL): void => {
      const t = new ArcadeTactics(level, ZONER);
      t.apply(view(a, 0, self, opp), cmd);
      expect(t.apply(view(a, late, self, opp), cmd) & Cmd.super).toBe(0);
    };
    no({ meter: SUPER_COST - 1, oppStun: 20 });
    no({ meter: SUPER_COST, oppStun: 20, selfStun: 3 });
    no({ meter: SUPER_COST, oppStun: 20, superActive: true });
    no({ meter: SUPER_COST, oppStun: 20 }, fighter(200, 300, 1 | 4));
    no({ meter: SUPER_COST, oppStun: 20 }, fighter(200, 300), fighter(700, 600));
    no({ meter: SUPER_COST, oppStun: 20 }, undefined, undefined, AI_EASY);
  });

  it('a new stun is a new confirm with a fresh reaction', () => {
    const t = new ArcadeTactics(AI_NORMAL, ZONER);
    t.apply(view({ oppStun: 5 }, 0), cmd);
    t.apply(view({ oppStun: 0 }, 1), cmd);
    expect(mem(t)[0]).toBe(-1);
    t.apply(view({ oppStun: 9 }, 2), cmd);
    expect(mem(t)[0]).toBe(2);
  });

  it('holds attacks once its combo reaches the level cap (Easy 1, Normal 3, Hard 5), and presses in below it', () => {
    const held = (level: 0 | 1 | 2, combo: number): boolean =>
      new ArcadeTactics(level, ZONER).apply(view({ oppStun: 10, combo }), cmd) === Cmd.left;
    expect([held(AI_EASY, 0), held(AI_EASY, 1)]).toEqual([false, true]);
    expect([held(AI_NORMAL, ARCADE_AI_COMBO_CAP - 1), held(AI_NORMAL, ARCADE_AI_COMBO_CAP)]).toEqual([false, true]);
    expect([held(AI_HARD, 4), held(AI_HARD, 5)]).toEqual([false, true]);
    expect(new ArcadeTactics(AI_NORMAL, ZONER).apply(view({ oppStun: 10, combo: 1 }), Cmd.secondary)).toBe(Cmd.secondary | Cmd.right);
  });
});

describe('ArcadeTactics: defence, spacing, weather and personality (WP-arcade-ai-personalities)', () => {
  const cmd = Cmd.primary | Cmd.left;
  const threat = (ticks: number): Partial<ArcadeView> => ({ shots: [shotIn(ticks)] });

  /** Tactics whose current threat was first seen at tick 0, with reaction `react` and `plan` acting `at` game ticks before the hit. */
  function planned(plan: number, at: number, react = 0): ArcadeTactics {
    const t = new ArcadeTactics(AI_NORMAL, ZONER);
    t.load({ mem: [-1, 0, 0, react, plan, at, ZONER], rng: null });
    return t;
  }

  it('impactIn gives the game ticks to the first overlap below the bound; toward gives the bits to the opponent', () => {
    const self = fighter(200, 300);
    expect(impactIn(self, shotIn(12), ARCADE_AI_LOOKAHEAD + 1)).toBe(12);
    expect(impactIn(self, shotIn(0), ARCADE_AI_LOOKAHEAD + 1)).toBe(0);
    expect(impactIn(self, shotIn(12), 10)).toBe(10); // not below the bound
    expect(impactIn(self, { ...shotIn(5), vx: 8 }, ARCADE_AI_LOOKAHEAD + 1)).toBe(ARCADE_AI_LOOKAHEAD + 1); // flying away
    expect(impactIn(self, { ...shotIn(5), y: 100 }, ARCADE_AI_LOOKAHEAD + 1)).toBe(ARCADE_AI_LOOKAHEAD + 1); // off the row
    expect(impactIn(self, { x: 500, y: 600, w: 20, h: 20, vx: -8, vy: -8 }, ARCADE_AI_LOOKAHEAD + 1)).toBe(28); // diagonal
    expect(toward(self, fighter(700, 300))).toBe(Cmd.right);
    expect(toward(self, fighter(0, 600))).toBe(Cmd.left | Cmd.down);
    expect(toward(self, fighter(220, 310))).toBe(0);
  });

  it('acts on a planned threat after its reaction, at its distance: parry and guard hold guard, dodge dashes at the opponent', () => {
    const parry = planned(PARRY, 6);
    expect(parry.apply(view(threat(7), 10), cmd)).toBe(cmd);
    expect(parry.apply(view(threat(6), 11), cmd)).toBe(Cmd.guard);
    expect(parry.apply(view(threat(5), 12), cmd)).toBe(Cmd.guard); // held while the threat lasts
    const guard = planned(GUARD, ARCADE_AI_GUARD_AT);
    expect(guard.apply(view(threat(ARCADE_AI_GUARD_AT + 1), 10), cmd)).toBe(cmd);
    expect(guard.apply(view(threat(ARCADE_AI_GUARD_AT), 11), cmd)).toBe(Cmd.guard);
    expect(planned(DODGE, ARCADE_AI_DODGE_AT).apply(view(threat(ARCADE_AI_DODGE_AT), 10), cmd)).toBe(Cmd.dash | Cmd.right);
    // The dash on cooldown: a guard press instead on Easy, a sidestep out of the line from Normal up (see below).
    const easyDodge = new ArcadeTactics(AI_EASY, ZONER);
    easyDodge.load({ mem: [-1, 0, 0, 0, DODGE, ARCADE_AI_DODGE_AT, ZONER, 0, 0], rng: null });
    expect(easyDodge.apply(view({ ...threat(ARCADE_AI_DODGE_AT), dashIn: 5 }, 10), cmd)).toBe(Cmd.guard);
    // Not before the reaction delay, not while stunned, nothing without a plan.
    expect(planned(PARRY, 6, 20).apply(view(threat(3), 10), cmd)).toBe(cmd);
    expect(planned(PARRY, 6).apply(view({ ...threat(3), selfStun: 4 }, 10), cmd)).toBe(cmd);
    expect(planned(NO_PLAN, ARCADE_AI_LOOKAHEAD).apply(view(threat(3), 10), cmd)).toBe(cmd);
  });

  it('draws one reaction and one plan per threat, and forgets the threat once no shot will hit', () => {
    const t = new ArcadeTactics(AI_NORMAL, ZONER);
    t.apply(view(threat(30), 5), cmd);
    const seen = mem(t);
    expect(seen[2]).toBe(5);
    expect(seen[3]).toBeGreaterThanOrEqual(ARCADE_AI_REACTION_MIN);
    expect(seen[3]).toBeLessThan(ARCADE_AI_REACTION_MIN + ARCADE_AI_REACTION_SPREAD);
    t.apply(view(threat(29), 6), cmd);
    expect(mem(t)).toEqual(seen);
    t.apply(view({ shots: [{ ...shotIn(5), vx: 8 }] }, 7), cmd); // flying away: no threat
    expect(mem(t)[2]).toBe(-1);
  });

  it('plans by personality and level: Easy never plans a parry, Hard reacts more, Turtle guards most, Rushdown dodges', () => {
    const plans = (level: 0 | 1 | 2, style: 0 | 1 | 2): number[] => {
      const counts = [0, 0, 0, 0];
      const t = new ArcadeTactics(level, style);
      for (let i = 0; i < 400; i++) {
        t.apply(view(threat(30), 2 * i), cmd);
        const plan = mem(t)[4] ?? NO_PLAN;
        counts[plan] = (counts[plan] ?? 0) + 1;
        t.apply(view({}, 2 * i + 1), cmd);
      }
      return counts;
    };
    const easy = plans(AI_EASY, ZONER);
    const hard = plans(AI_HARD, ZONER);
    expect(easy[PARRY]).toBe(0);
    expect(hard[NO_PLAN] ?? 0).toBeLessThan(easy[NO_PLAN] ?? 0);
    expect(hard[PARRY] ?? 0).toBeGreaterThan(hard[DODGE] ?? 0); // Zoner: parry 500, dodge 300, guard 100 pm
    expect(plans(AI_HARD, TURTLE)[GUARD] ?? 0).toBeGreaterThan(hard[GUARD] ?? 0);
    const rush = plans(AI_HARD, RUSHDOWN);
    expect(rush[DODGE] ?? 0).toBeGreaterThan(rush[PARRY] ?? 0);
  });

  it('a Rushdown dashes in from afar at its level rate, never on cooldown or up close; the others leave spacing to the base AI', () => {
    const count = (t: ArcadeTactics, a: Partial<ArcadeView>, opp?: FighterView): number => {
      let n = 0;
      for (let i = 0; i < 300; i++) {
        const c = t.apply(view(a, i, fighter(200, 300), opp), cmd);
        if ((c & Cmd.dash) !== 0) {
          expect(c).toBe(Cmd.primary | Cmd.dash | Cmd.right);
          n++;
        }
      }
      return n;
    };
    const hard = count(new ArcadeTactics(AI_HARD, RUSHDOWN), {});
    const easy = count(new ArcadeTactics(AI_EASY, RUSHDOWN), {});
    expect(hard).toBeGreaterThan(easy);
    expect(hard).toBeLessThan(60);
    expect(count(new ArcadeTactics(AI_HARD, RUSHDOWN), { dashIn: 3 })).toBe(0);
    expect(count(new ArcadeTactics(AI_HARD, RUSHDOWN), {}, fighter(400, 300))).toBe(0);
    expect(count(new ArcadeTactics(AI_HARD, ZONER), {})).toBe(0);
    expect(count(new ArcadeTactics(AI_HARD, TURTLE), {})).toBe(0);
  });

  it('sidestep leaves the line of a flying shot, towards the side with room, and never into a wall', () => {
    const self = fighter(200, 300);
    // Shot along a row below self's centre: self steps up, away from it; above it: down.
    expect(sidestep(self, { ...shotIn(10), y: 340 })).toBe(Cmd.up);
    expect(sidestep(self, { ...shotIn(10), y: 300 })).toBe(Cmd.down);
    // No room above (top wall): it goes down although the shot is below.
    expect(sidestep(fighter(200, 10), { ...shotIn(10), y: 80 })).toBe(Cmd.down);
    // A vertical shot is left sideways.
    expect(sidestep(self, { x: 250, y: 100, w: 20, h: 20, vx: 0, vy: 8 })).toBe(Cmd.left);
    expect(sidestep(self, { x: 200, y: 100, w: 20, h: 20, vx: 0, vy: 8 })).toBe(Cmd.right);
  });

  it('a dodge with the dash cooling down walks out of the line and no longer takes the hit (Normal and Hard), starting from further out than a dash', () => {
    for (const level of [AI_NORMAL, AI_HARD] as const) {
      const t = new ArcadeTactics(level, ZONER);
      t.load({ mem: [-1, 0, 0, 0, DODGE, ARCADE_AI_DODGE_AT, ZONER, 0, 0], rng: null });
      expect(t.apply(view({ ...threat(ARCADE_AI_LOOKAHEAD), dashIn: 5 }, 10), cmd)).toBe(cmd); // not yet
      const dir = t.apply(view({ ...threat(ARCADE_AI_SIDESTEP_AT), dashIn: 5 }, 11), cmd);
      expect(dir === Cmd.up || dir === Cmd.down).toBe(true);
      // Out of the line the shot misses: no threat.
      const me = fighter(200, dir === Cmd.up ? 200 : 400);
      expect(impactIn(me, shotIn(20), ARCADE_AI_LOOKAHEAD + 1)).toBe(ARCADE_AI_LOOKAHEAD + 1);
    }
  });

  it('a Normal or Hard AI spends a full bar on a super that reaches the opponent, without a confirm, and more eagerly when low', () => {
    const count = (level: 0 | 1 | 2, self: FighterView, opp: FighterView, a: Partial<ArcadeView> = {}): number => {
      const t = new ArcadeTactics(level, ZONER);
      let n = 0;
      for (let i = 0; i < 400; i++) {
        const c = t.apply(view({ meter: SUPER_COST, ...a }, i, self, opp), cmd);
        if ((c & Cmd.super) !== 0) {
          expect(c).toBe(Cmd.super | Cmd.right);
          n++;
        }
      }
      return n;
    };
    const self = fighter(200, 300);
    const near = fighter(500, 300);
    expect(count(AI_EASY, self, near)).toBe(0);
    const normal = count(AI_NORMAL, self, near);
    const hard = count(AI_HARD, self, near);
    expect(normal).toBeGreaterThan(0);
    expect(hard).toBeGreaterThan(normal);
    expect(count(AI_HARD, { ...self, hp: 20 }, near)).toBeGreaterThan(hard); // below DESPERATE_PM
    expect(count(AI_HARD, self, fighter(500, 700))).toBe(0); // off the band
    expect(count(AI_HARD, self, near, { meter: SUPER_COST - 1 })).toBe(0);
    expect(count(AI_HARD, self, near, { selfStun: 3 })).toBe(0);
    expect(count(AI_HARD, self, near, { superActive: true })).toBe(0);
    expect(count(AI_HARD, self, near, { shots: [shotIn(10)] })).toBe(0); // defends first
  });

  it('on Hard a Zoner melee hero charges from afar too, a Turtle as well; Normal leaves it to Rushdown', () => {
    const count = (level: 0 | 1 | 2, style: 0 | 1 | 2): number => {
      const t = new ArcadeTactics(level, style);
      let n = 0;
      for (let i = 0; i < 400; i++) if ((t.apply(view({ dashIn: 9, chargeIn: 0 }, i), cmd) & Cmd.charge) !== 0) n++;
      return n;
    };
    expect(count(AI_HARD, ZONER)).toBeGreaterThan(0);
    expect(count(AI_HARD, TURTLE)).toBeGreaterThan(0);
    expect(count(AI_NORMAL, ZONER)).toBe(0);
    expect(count(AI_HARD, RUSHDOWN)).toBe(400); // Rushdown always did
  });

  it('anti-stalemate: with no HP change for ARCADE_AI_STALE_TICKS a Zoner or Turtle plays Rushdown (charges from afar); damage restarts the clock', () => {
    const self = fighter(100, 300);
    const far = fighter(700, 300);
    const charges = (t: ArcadeTactics, from: number, to: number, opp = far): number => {
      let n = 0;
      for (let i = from; i < to; i++) if ((t.apply(view({ dashIn: 9, chargeIn: 0 }, i, self, opp), cmd) & Cmd.charge) !== 0) n++;
      return n;
    };
    for (const style of [ZONER, TURTLE] as const) {
      const t = new ArcadeTactics(AI_NORMAL, style); // Normal never charges as a Zoner or Turtle otherwise
      expect(charges(t, 0, ARCADE_AI_STALE_TICKS - 1)).toBe(0);
      expect(charges(t, ARCADE_AI_STALE_TICKS, ARCADE_AI_STALE_TICKS + 50)).toBe(50);
      expect(charges(t, ARCADE_AI_STALE_TICKS + 50, ARCADE_AI_STALE_TICKS + 100, { ...far, hp: 90 })).toBe(0);
    }
  });

  it('Normal and Hard act on almost every threat, Easy on few: the plan draw leaves NO_PLAN rarely', () => {
    const idle = (level: 0 | 1 | 2, style: 0 | 1 | 2): number => {
      let n = 0;
      const t = new ArcadeTactics(level, style);
      for (let i = 0; i < 600; i++) {
        t.apply(view({ shots: [shotIn(30)] }, 2 * i), cmd);
        if (mem(t)[4] === NO_PLAN) n++;
        t.apply(view({}, 2 * i + 1), cmd);
      }
      return n;
    };
    for (const style of [RUSHDOWN, ZONER, TURTLE] as const) {
      expect(idle(AI_HARD, style)).toBeLessThan(60); // under 10%
      expect(idle(AI_NORMAL, style)).toBeLessThan(250);
      expect(idle(AI_EASY, style)).toBeGreaterThan(300);
    }
  });

  it('a Rushdown melee hero charges from far away; ranged, close, cooling down and other styles do not', () => {
    const go = (t: ArcadeTactics, a: Partial<ArcadeView>, self = fighter(200, 300)): boolean =>
      (t.apply(view({ dashIn: 9, ...a }, 0, self), cmd) & Cmd.charge) !== 0;
    expect(go(new ArcadeTactics(AI_NORMAL, RUSHDOWN), { chargeIn: 0 })).toBe(true);
    expect(go(new ArcadeTactics(AI_NORMAL, RUSHDOWN), { chargeIn: -1 })).toBe(false);
    expect(go(new ArcadeTactics(AI_NORMAL, RUSHDOWN), { chargeIn: 40 })).toBe(false);
    expect(go(new ArcadeTactics(AI_NORMAL, RUSHDOWN), { chargeIn: 0 }, fighter(600, 300))).toBe(false);
    expect(go(new ArcadeTactics(AI_NORMAL, ZONER), { chargeIn: 0 })).toBe(false);
  });

  it('calls its weather when its element is at a disadvantage, free, ready and unthreatened', () => {
    const t = new ArcadeTactics(AI_NORMAL, ZONER, true);
    expect(t.apply(view({}), cmd)).toBe(cmd | Cmd.weather);
    expect(t.apply(view({ weatherIn: 30 }), cmd)).toBe(cmd);
    // WP-arcade-weather-charge: nothing to cast until the charge is full.
    expect(t.apply(view({ weatherCharge: 999 }), cmd)).toBe(cmd);
    expect(t.apply(view({ weatherCharge: 0 }), cmd)).toBe(cmd);
    expect(t.apply(view({ selfStun: 3 }), cmd)).toBe(cmd);
    expect(t.apply(view(threat(30), 1), cmd)).toBe(cmd);
    expect(new ArcadeTactics(AI_NORMAL, ZONER).apply(view({}), cmd)).toBe(cmd);
  });

  it('draws its personality from the match seed once (Turtle when at an elemental disadvantage) and keeps it', () => {
    const seen = new Set<number>();
    for (let seed = 0; seed < 30; seed++) {
      const t = new ArcadeTactics();
      t.apply({ ...view({}), matchSeed: seed }, cmd);
      const style = mem(t)[6] ?? -1;
      t.apply({ ...view({}, 1), matchSeed: seed }, cmd);
      expect(mem(t)[6]).toBe(style);
      seen.add(style);
    }
    expect([...seen].sort((x, y) => x - y)).toEqual([RUSHDOWN, ZONER, TURTLE]);
    const turtle = new ArcadeTactics(AI_NORMAL, undefined, true);
    turtle.apply(view({}), cmd);
    expect(mem(turtle)[6]).toBe(TURTLE);
  });

  it('save/load round-trips through JSON mid-threat: the copy issues the same commands on the same views', () => {
    const views = Array.from({ length: 80 }, (_, i) =>
      view({ shots: i < 40 ? [shotIn(40 - i)] : [], oppStun: i > 50 ? 10 : 0, meter: SUPER_COST, combo: 1 }, i));
    const t = new ArcadeTactics(AI_HARD, undefined, true);
    for (const v of views.slice(0, 20)) t.apply(v, cmd);
    const copy = new ArcadeTactics(AI_HARD, undefined, true);
    copy.load(JSON.parse(JSON.stringify(t.save())) as AgentState);
    for (const v of views.slice(20)) expect(copy.apply(v, cmd)).toBe(t.apply(v, cmd));
    expect(copy.save()).toEqual(t.save());
    copy.load(null);
    expect(copy.save()).toEqual(new ArcadeTactics(AI_HARD).save());
    expect(() => {
      copy.load(7);
    }).toThrow(TypeError);
  });
});

describe('avoidChord (WP-arcade-buffer)', () => {
  const both = Cmd.primary | Cmd.secondary | Cmd.left;
  const bar = { ...FREE, meter: SUPER_COST };

  it('drops the press that would complete a chord, at the window edges', () => {
    expect(avoidChord(bar, both)).toBe(Cmd.primary | Cmd.left);
    expect(avoidChord({ ...bar, primaryAge: SUPER_CHORD_TICKS - 1 }, Cmd.secondary)).toBe(0);
    expect(avoidChord({ ...bar, primaryAge: SUPER_CHORD_TICKS }, Cmd.secondary)).toBe(0);
    expect(avoidChord({ ...bar, primaryAge: SUPER_CHORD_TICKS + 1 }, Cmd.secondary)).toBe(Cmd.secondary);
    expect(avoidChord({ ...bar, secondaryAge: SUPER_CHORD_TICKS }, Cmd.primary)).toBe(0);
    expect(avoidChord({ ...bar, secondaryAge: SUPER_CHORD_TICKS + 1 }, Cmd.primary)).toBe(Cmd.primary);
  });

  it('keeps held buttons, and every press when a chord would not start a super', () => {
    expect(avoidChord({ ...bar, prevCmd: Cmd.secondary, primaryAge: 0 }, Cmd.primary | Cmd.secondary)).toBe(
      Cmd.primary | Cmd.secondary,
    );
    expect(avoidChord({ ...bar, meter: SUPER_COST - 1 }, both)).toBe(both);
    expect(avoidChord({ ...bar, superActive: true }, both)).toBe(both);
  });

  it('ArcadeTactics applies it, but never to its own super', () => {
    expect(new ArcadeTactics(AI_NORMAL, ZONER).apply(view({ meter: SUPER_COST }), both)).toBe(Cmd.primary | Cmd.left);
    const t = new ArcadeTactics(AI_NORMAL, ZONER);
    t.apply(view({ meter: SUPER_COST, oppStun: 20, primaryAge: 0 }, 0), both);
    expect(t.apply(view({ meter: SUPER_COST, oppStun: 20, primaryAge: 0 }, 50), both)).toBe(Cmd.super | Cmd.right);
  });
});

describe('Arcade geometry helpers', () => {
  it('superFacing picks the 4-way facing whose band covers the opponent', () => {
    const self = fighter(400, 300);
    expect(superFacing(self, fighter(900, 340))).toBe(Cmd.right);
    expect(superFacing(self, fighter(0, 260))).toBe(Cmd.left);
    expect(superFacing(self, fighter(420, 650))).toBe(Cmd.down);
    expect(superFacing(self, fighter(380, 100))).toBe(Cmd.up);
    expect(superFacing(self, fighter(900, 650))).toBe(0);
  });

  it('superFacing uses the race super: Hellfire band 200, vortex box 480, quake last ring (Titan 600), tide wall', () => {
    const self = fighter(400, 300);
    expect(superFacing(self, fighter(900, 430), 0)).toBe(0);
    expect(superFacing(self, fighter(900, 430), 1)).toBe(Cmd.right);
    expect(superFacing(self, fighter(600, 450), 4)).toBe(Cmd.right);
    expect(superFacing(self, fighter(700, 450), 4)).toBe(0);
    expect(superFacing(self, fighter(660, 300), 7)).toBe(Cmd.right);
    expect(superFacing(self, fighter(720, 300), 7)).toBe(0);
    expect(superFacing(self, fighter(720, 300), 8)).toBe(Cmd.right);
    expect(superFacing(self, fighter(900, 650), 10)).toBe(Cmd.right);
    expect(superFacing(self, fighter(380, 650), 10)).toBe(Cmd.down);
  });

  it('pressStep closes in along the shared axis only, and never turns a shot', () => {
    const self = fighter(200, 300);
    expect(pressStep(self, fighter(700, 320), Cmd.up)).toBe(Cmd.right);
    expect(pressStep(self, fighter(210, 700), 0)).toBe(Cmd.down);
    expect(pressStep(self, fighter(300, 300), Cmd.up)).toBe(Cmd.up); // already close
    expect(pressStep(self, fighter(700, 700), Cmd.up)).toBe(Cmd.up); // no shared axis
    expect(pressStep(self, fighter(700, 300), Cmd.primary | Cmd.up)).toBe(Cmd.primary | Cmd.up);
  });
});

describe('8-way aim (WP-arcade-8way-aim)', () => {
  const self = fighter(200, 300);

  it('diagonalLine finds the diagonal a shot from the centre would follow to the opponent', () => {
    expect(diagonalLine(self, fighter(500, 600))).toBe(Cmd.right | Cmd.down);
    expect(diagonalLine(self, fighter(500, 40))).toBe(Cmd.right | Cmd.up); // offsets 300 and 260: within half a body
    expect(diagonalLine(self, fighter(0, 100))).toBe(Cmd.left | Cmd.up);
    expect(diagonalLine(self, fighter(540, 40))).toBe(0); // 340 vs 260: off the diagonal
    expect(diagonalLine(self, fighter(700, 330))).toBe(0); // on the row: an axis shot
    expect(diagonalLine(self, fighter(230, 700))).toBe(0); // on the column
  });

  it('fires a ready projectile slot along the diagonal when no axis shot lines up', () => {
    const t = new ArcadeTactics(AI_NORMAL, TURTLE);
    const diag = view({}, 0, self, fighter(500, 600));
    expect(t.apply(diag, Cmd.left, Cmd.primary)).toBe(Cmd.primary | Cmd.right | Cmd.down);
    expect(t.apply(diag, Cmd.left, 0)).toBe(Cmd.left); // nothing ready
    expect(t.apply(view({}, 0, self, fighter(540, 40)), Cmd.left, Cmd.primary)).toBe(Cmd.left); // off the line
    expect(t.apply(view(undefined, 0, self, fighter(500, 600)), Cmd.left, Cmd.primary)).toBe(Cmd.left); // Classic
  });

  it("keeps the base AI's 4-way shot: a second movement axis is dropped (Classic's x wins)", () => {
    const t = new ArcadeTactics(AI_NORMAL, TURTLE);
    expect(t.apply(view({}), Cmd.primary | Cmd.left | Cmd.up, Cmd.primary)).toBe(Cmd.primary | Cmd.left);
    expect(t.apply(view({}), Cmd.primary | Cmd.up, Cmd.primary)).toBe(Cmd.primary | Cmd.up);
    expect(t.apply(view(undefined), Cmd.primary | Cmd.left | Cmd.up)).toBe(Cmd.primary | Cmd.left | Cmd.up);
  });

  it('in an Arcade match the scripted AI lands a diagonal shot, and its snapshot round trip replays the same commands', () => {
    const world = skipIntro(createMatch({
      ...SETUP, flags: { ...DEFAULT_SIM_FLAGS, rulesetArcade: true },
      p1: [{ character: characterId('pax'), xp: 1 }], p2: [{ character: characterId('sindarosa'), xp: 1 }],
    }));
    const s = world.state;
    const me = controlledId(world, 0);
    const ai = controlledId(world, 1);
    s.x[me] = 300; s.y[me] = 560; s.x[ai] = 700; s.y[ai] = 160;
    s.hp[me] = 10_000;
    const options = { id: 'ai', activeCount: (slot: 0 | 1) => s.abil[countIdx(controlledId(world, 1), slot)] ?? 0 };
    const profile = scriptedProfileFor(getCharacter(characterId('sindarosa')), getCharacter(characterId('pax')));
    const agent = new ScriptedAI(profile, options);
    const idle = { id: 'idle', observe: () => 0, save: () => null, load: () => undefined };
    let diagonal = false;
    let hit = false;
    let saved: ReturnType<ScriptedAI['save']> | undefined;
    const cmds: number[] = [];
    for (let i = 0; i < 120 && !hit; i++) {
      if (i === 1) saved = JSON.parse(JSON.stringify(agent.save())) as ReturnType<ScriptedAI['save']>;
      const pair = collectCommands(world, [idle, agent]);
      cmds.push(pair[1]);
      const evs = step(world, pair);
      for (let id = 0; id < MAX_ENTITIES; id++) {
        if (s.kind[id] === EntityKind.projectile && s.team[id] === 1 && ((s.flags[id] ?? 0) & EntityFlag.alive) !== 0) diagonal ||= ((s.dir[id] ?? 0) & 1) === 1;
      }
      hit = evs.some((e) => e.kind === SimEventKind.hitConfirmed && e['target'] === me);
    }
    expect(diagonal).toBe(true);
    expect(hit).toBe(true);
    // Replaying from tick 1: a fresh agent loaded with the saved state chooses the same commands on the same views.
    const replayWorld = skipIntro(createMatch({
      ...SETUP, flags: { ...DEFAULT_SIM_FLAGS, rulesetArcade: true },
      p1: [{ character: characterId('pax'), xp: 1 }], p2: [{ character: characterId('sindarosa'), xp: 1 }],
    }));
    const r = replayWorld.state;
    r.x[me] = 300; r.y[me] = 560; r.x[ai] = 700; r.y[ai] = 160;
    r.hp[me] = 10_000;
    const first = new ScriptedAI(profile, { id: 'ai', activeCount: (slot: 0 | 1) => r.abil[countIdx(controlledId(replayWorld, 1), slot)] ?? 0 });
    step(replayWorld, collectCommands(replayWorld, [idle, first]));
    const copy = new ScriptedAI(profile, { id: 'ai', activeCount: (slot: 0 | 1) => r.abil[countIdx(controlledId(replayWorld, 1), slot)] ?? 0 });
    copy.load(saved ?? null);
    for (let i = 1; i < cmds.length; i++) {
      const pair = collectCommands(replayWorld, [idle, copy]);
      expect(pair[1]).toBe(cmds[i]);
      step(replayWorld, pair);
    }
    expect(hash(replayWorld.state)).toBe(hash(s));
  });
});

describe('Classic decisions are untouched', () => {
  it('a Classic match never gives the layer an arcade view, so it is the identity', () => {
    const world = createMatch(SETUP);
    const t = new ArcadeTactics(AI_HARD, undefined, true);
    for (let i = 0; i < 300; i++) {
      for (const side of [0, 1] as const) {
        const v = createObservationView(world, side);
        expect(v.arcade).toBeUndefined();
        expect(t.apply(v, i & 0x3f)).toBe(i & 0x3f);
      }
      step(world, [Cmd.primary | Cmd.right, Cmd.primary | Cmd.left]);
    }
    expect(t.save()).toEqual(new ArcadeTactics().save()); // no memory, no draw: its stream is never seeded
  });
});

describe('the Arcade AI in a match (WP-arcade-ai-personalities)', () => {
  /** Defence events of a Hard scripted Pax with `style`, facing Sindarosa firing along its row for 1500 ticks. */
  function defence(style: 0 | 1 | 2): Record<string, number> {
    const world = skipIntro(createMatch({
      ...SETUP, flags: { ...DEFAULT_SIM_FLAGS, rulesetArcade: true },
      p1: [{ character: characterId('sindarosa'), xp: 1 }], p2: [{ character: characterId('pax'), xp: 1 }],
    }));
    const s = world.state;
    const ai = controlledId(world, 1);
    s.hp[ai] = 100_000;
    s.maxHp[ai] = 100_000;
    const profile = scriptedProfileFor(getCharacter(characterId('pax')), getCharacter(characterId('sindarosa')));
    const agent = new ScriptedAI(profile, { id: 'ai', level: AI_HARD, personality: style });
    const shooter = { id: 'shooter', observe: () => Cmd.primary | Cmd.right, save: () => null, load: () => undefined };
    const out = { guarded: 0, parried: 0, perfectDodge: 0 };
    for (let i = 0; i < 1500; i++) {
      // Both pinned on one row, 700 px apart (the AI's dashes still make it invulnerable, they just do not move it).
      const me = controlledId(world, 0);
      [s.x[me], s.y[me], s.x[ai], s.y[ai]] = [200, 360, 900, 360];
      for (const e of step(world, collectCommands(world, [shooter, agent]))) {
        if (e.kind === SimEventKind.guarded) out.guarded++;
        if (e.kind === SimEventKind.parried) out.parried++;
        if (e.kind === SimEventKind.perfectDodge) out.perfectDodge++;
      }
    }
    return out;
  }

  it('a Hard Turtle guards and parries the shots it observes; a Hard Rushdown dodges through them', () => {
    const turtle = defence(TURTLE);
    expect(turtle.guarded).toBeGreaterThan(0);
    expect(turtle.parried).toBeGreaterThan(0);
    expect(defence(RUSHDOWN).perfectDodge).toBeGreaterThan(0);
  });
});

describe('the Arcade AI tags (WP-arcade-tag)', () => {
  const low = (hp: number): FighterView => ({ ...fighter(200, 300), hp });

  it('the view carries the tag cooldown and the swap1 partner HP per mille (-1 once it is down)', () => {
    const world = skipIntro(createMatch({
      ...SETUP, flags: { ...DEFAULT_SIM_FLAGS, rulesetArcade: true },
      p1: [{ character: characterId('sindarosa'), xp: 1 }, { character: characterId('fiara'), xp: 1 }],
    }));
    const s = world.state;
    s.hp[1] = (s.maxHp[1] ?? 0) / 2;
    s.teams[1] = (s.arcade[ARCADE_WORLD_BASE + ArcadeW.gameTick] ?? 0) + 40;
    expect(createObservationView(world, 0).arcade).toMatchObject({ tagIn: 40, partnerPm: 500 });
    expect(createObservationView(world, 1).arcade).toMatchObject({ tagIn: 0, partnerPm: -1 });
    s.flags[1] = (s.flags[1] ?? 0) | EntityFlag.dead;
    expect(createObservationView(world, 0).arcade?.partnerPm).toBe(-1);
  });

  it('tags when low and the partner is healthier by the margin, free, ready and unthreatened; no draw', () => {
    const t = new ArcadeTactics(AI_NORMAL, ZONER);
    const tags = (a: Partial<ArcadeView>, hp = 30): boolean =>
      (t.apply(view(a, 0, low(hp)), Cmd.left) & Cmd.swap1) !== 0;
    expect(tags({ partnerPm: 600 })).toBe(true);
    expect(tags({ partnerPm: 600 }, 34)).toBe(true);
    expect(tags({ partnerPm: 600 }, 35)).toBe(false); // not below ARCADE_AI_TAG_BELOW_PM
    expect(tags({ partnerPm: 550 })).toBe(false); // not more than ARCADE_AI_TAG_MARGIN_PM healthier
    expect(tags({ partnerPm: -1 }, 1)).toBe(false); // no partner (1v1, or down)
    expect(tags({ partnerPm: 900, tagIn: 1 })).toBe(false); // cooldown
    expect(tags({ partnerPm: 900, selfStun: 5 })).toBe(false); // not free
    expect(t.save()).toEqual({ mem: [-1, 0, -1, 0, NO_PLAN, 0, ZONER, 0, 0, 0, 130], rng: null });
    expect(tags({ partnerPm: 900, shots: [shotIn(10)] })).toBe(false); // threatened
  });

  it('two scripted AIs in a 2v2 Arcade match tag, enter with their entrance attack and finish the match', () => {
    const setup: MatchSetup = {
      ...SETUP, seed: 21, flags: { ...DEFAULT_SIM_FLAGS, rulesetArcade: true },
      p1: [{ character: characterId('sindarosa'), xp: 1 }, { character: characterId('curomo'), xp: 1 }],
      p2: [{ character: characterId('lavax'), xp: 1 }, { character: characterId('cyclonius'), xp: 1 }],
    };
    const world = createMatch(setup);
    const ai = (me: string, opp: string, id: string): ScriptedAI =>
      new ScriptedAI(scriptedProfileFor(getCharacter(characterId(me)), getCharacter(characterId(opp))), { id, level: AI_HARD });
    const agents = [ai('sindarosa', 'lavax', 'a'), ai('lavax', 'sindarosa', 'b')] as const;
    let tags = 0;
    let ended = false;
    for (let i = 0; i < 20_000 && !ended; i++) {
      for (const e of step(world, collectCommands(world, agents))) {
        if (e.kind === SimEventKind.tagIn) tags++;
        if (e.kind === SimEventKind.matchEnded) ended = true;
      }
    }
    expect(tags).toBeGreaterThan(0);
    expect(ended).toBe(true);
  });
});

describe('ArcadeTactics: rock avoidance (FUN-DESIGN 2.15)', () => {
  /** A rock 100 px right of a fighter at (200, 300): x 380..480, y 260..460 (centre y 360). */
  const rock = { x: 380, y: 260, w: 100, h: 200 };
  const near = (rocks: ArcadeView['rocks'], self = fighter(296, 300), opp = fighter(900, 300), tick = 0): ObservationView =>
    view({ rocks }, tick, self, opp);
  const MOVES = Cmd.up | Cmd.down | Cmd.left | Cmd.right;

  it('slides along the rock edge when a move would enter it, keeping the move and taking the nearer free side', () => {
    // Fighter at y 300 (bottom 380): up clears the rock top (260) in 120 px, down its bottom (460) in 160: up.
    // Touching the rock a diagonal would still enter it, so the slide is the other axis alone; farther away it keeps the move.
    const up = new ArcadeTactics(AI_NORMAL, ZONER).apply(near([rock]), Cmd.right);
    expect(up).toBe(Cmd.up);
    // Lower fighter (y 380, bottom 460): the bottom edge is nearer.
    const down = new ArcadeTactics(AI_NORMAL, ZONER).apply(near([rock], fighter(296, 380)), Cmd.right);
    expect(down).toBe(Cmd.down);
  });

  it('breaks a tie upwards and a horizontal tie to the left, and never stands still against a rock', () => {
    const level = { x: 380, y: 300, w: 100, h: 80 };
    expect(new ArcadeTactics(AI_NORMAL, ZONER).apply(near([level], fighter(296, 300)), Cmd.right) & Cmd.up).toBe(Cmd.up);
    const t = new ArcadeTactics(AI_NORMAL, ZONER);
    expect(t.apply(view({ rocks: [{ x: 300, y: 400, w: 80, h: 100 }] }, 0, fighter(300, 320), fighter(300, 700)), Cmd.down) & Cmd.left).toBe(Cmd.left);
    for (const c of [Cmd.right, Cmd.right | Cmd.up, Cmd.right | Cmd.down]) {
      expect(new ArcadeTactics(AI_NORMAL, ZONER).apply(near([rock]), c) & MOVES).not.toBe(0);
    }
  });

  it('holds the slide for ARCADE_AI_SLIDE_TICKS, whatever the base command says, then decides afresh', () => {
    const t = new ArcadeTactics(AI_NORMAL, ZONER);
    expect(t.apply(near([rock]), Cmd.right)).toBe(Cmd.up);
    expect(t.apply(near([rock], fighter(296, 290), fighter(900, 300), 5), Cmd.down)).toBe(Cmd.up);
    expect(t.apply(near([rock], fighter(296, 290), fighter(900, 300), ARCADE_AI_SLIDE_TICKS), Cmd.down)).toBe(Cmd.down);
  });

  it('leaves the command alone with no rock in the way, for guard, dash and super, inside a rock, and in Classic', () => {
    const t = (): ArcadeTactics => new ArcadeTactics(AI_NORMAL, ZONER);
    expect(t().apply(near([rock]), Cmd.left)).toBe(Cmd.left);
    expect(t().apply(near([rock]), Cmd.up)).toBe(Cmd.up);
    expect(t().apply(near([rock], fighter(150, 300)), Cmd.right)).toBe(Cmd.right);
    expect(t().apply(near([rock]), Cmd.guard)).toBe(Cmd.guard);
    expect(t().apply(near([rock]), Cmd.right | Cmd.dash)).toBe(Cmd.right | Cmd.dash);
    expect(t().apply(near([rock], fighter(400, 300)), Cmd.right)).toBe(Cmd.right);
    expect(t().apply(near([]), Cmd.right)).toBe(Cmd.right);
    expect(t().apply(view(undefined), Cmd.right)).toBe(Cmd.right);
  });

  it('repositions instead of shooting into a rock: the attack goes, a slide to a clear line starts', () => {
    const t = new ArcadeTactics(AI_NORMAL, ZONER);
    const cmd = t.apply(near([rock], fighter(200, 300)), Cmd.primary);
    expect(cmd & Cmd.primary).toBe(0);
    expect(cmd & MOVES).not.toBe(0);
    // A clear line fires as before.
    expect(new ArcadeTactics(AI_NORMAL, ZONER).apply(near([rock], fighter(200, 500), fighter(900, 500)), Cmd.secondary)).toBe(Cmd.secondary);
  });

  it('stays clear of the playfield walls: the slide takes the other side when the nearer one has no room', () => {
    const top = { x: 380, y: 200, w: 100, h: 200 };
    const cmd = new ArcadeTactics(AI_NORMAL, ZONER).apply(near([top], fighter(296, 200)), Cmd.right);
    expect(cmd).toBe(Cmd.down);
  });

  it('save() and load() round-trip the slide', () => {
    const a = new ArcadeTactics(AI_NORMAL, ZONER);
    a.apply(near([rock]), Cmd.right);
    const b = new ArcadeTactics(AI_NORMAL, ZONER);
    b.load(JSON.parse(JSON.stringify(a.save())) as AgentState);
    const v = near([rock], fighter(296, 290), fighter(900, 300), 5);
    expect(b.apply(v, Cmd.down)).toBe(a.apply(v, Cmd.down));
    expect(b.save()).toEqual(a.save());
    // An older memory without the slide slots loads as no slide.
    const old = new ArcadeTactics(AI_NORMAL, ZONER);
    old.load({ mem: [-1, 0, -1, 0, 3, 0, 1], rng: null });
    expect(old.apply(near([rock]), Cmd.left)).toBe(Cmd.left);
  });

  it('the observation lists the rocks as fresh plain rectangles, none for an earth fighter or off an earth stage', () => {
    const mk = (race: string): ReturnType<typeof createMatch> => {
      const w = skipIntro(createMatch({ ...SETUP, flags: { ...DEFAULT_SIM_FLAGS, rulesetArcade: true }, p1: [{ character: characterId(race), xp: 1 }] }));
      w.state.arcade[ARCADE_WORLD_BASE + ArcadeW.stage] = 3;
      w.state.arcade[ARCADE_WORLD_BASE + ArcadeW.patchCount] = 1;
      w.state.arcade.set([400, 300, 100, 100], ARCADE_WORLD_BASE + ArcadeW.patches);
      return w;
    };
    const rocks = createObservationView(mk('sindarosa'), 0).arcade?.rocks;
    expect(rocks).toEqual([{ x: 400, y: 300, w: 100, h: 100 }]);
    expect(createObservationView(mk('rokcore'), 0).arcade?.rocks).toEqual([]);
    const w = mk('sindarosa');
    w.state.arcade[ARCADE_WORLD_BASE + ArcadeW.stage] = 1;
    expect(createObservationView(w, 0).arcade?.rocks).toEqual([]);
    const first = createObservationView(mk('sindarosa'), 0).arcade?.rocks;
    expect(first).not.toBe(createObservationView(mk('sindarosa'), 0).arcade?.rocks);
  });
});
