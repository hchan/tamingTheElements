import { describe, expect, it } from 'vitest';
import { SUPER_COST } from '../../data/arcade';
import { characterId } from '../../data/ids';
import { DEFAULT_SIM_FLAGS } from '../../flags';
import { Cmd } from '../../sim/commands';
import { hash } from '../../sim/hash';
import { createMatch, type MatchSetup } from '../../sim/match';
import { ARCADE_E, ARCADE_T, ARCADE_TEAM_BASE, ARCADE_WORLD_BASE, ArcadeE, ArcadeT, ArcadeW, World } from '../../sim/state';
import { step } from '../../sim/step';
import { createObservationView, type ArcadeView, type FighterView, type ObservationView } from '../agent';
import { ARCADE_AI_COMBO_CAP, ARCADE_AI_REACTION_MIN, ArcadeTactics, pressStep, superFacing } from './arcade';

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

const FREE: ArcadeView = { meter: 0, oppMeter: 0, selfStun: 0, oppStun: 0, freeze: 0, combo: 0, oppCombo: 0, superActive: false };

function view(arcade: Partial<ArcadeView> | undefined, tick = 0, self = fighter(200, 300), opp = fighter(700, 300)): ObservationView {
  return {
    side: 0, tick, self, opponent: opp, cooldowns: [0, 0, 0, 0], matchSeed: 0,
    ...(arcade !== undefined && { arcade: { ...FREE, ...arcade } }),
  };
}

/** A draw that counts its calls and always returns 0 (the shortest reaction). */
function counter(): { draw: (n: number) => number; calls: number } {
  const c = { calls: 0, draw: (): number => (c.calls++, 0) };
  return c;
}

describe('ObservationView.arcade', () => {
  it('is absent in Classic', () => {
    expect('arcade' in createObservationView(createMatch(SETUP), 0)).toBe(false);
  });

  it('copies the visible Arcade state per side and never changes the world', () => {
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
    const before = hash(s);
    expect(createObservationView(world, 0).arcade).toEqual({
      meter: 1200, oppMeter: 300, selfStun: 0, oppStun: 14, freeze: 6, combo: 2, oppCombo: 0, superActive: true,
    });
    expect(createObservationView(world, 1).arcade).toEqual({
      meter: 300, oppMeter: 1200, selfStun: 14, oppStun: 0, freeze: 6, combo: 0, oppCombo: 2, superActive: false,
    });
    expect(hash(s)).toBe(before);
  });
});

describe('ArcadeTactics (Normal)', () => {
  const cmd = Cmd.primary | Cmd.left;

  it('returns the Classic command untouched and draws nothing without view.arcade', () => {
    const t = new ArcadeTactics();
    const c = counter();
    for (const tick of [0, 1, 2]) expect(t.apply(view(undefined, tick), cmd, c.draw)).toBe(cmd);
    expect(c.calls).toBe(0);
    expect(t.save()).toEqual(new ArcadeTactics().save());
  });

  it('leaves the command alone while the opponent is free', () => {
    const c = counter();
    expect(new ArcadeTactics().apply(view({ meter: SUPER_COST }), cmd, c.draw)).toBe(cmd);
    expect(c.calls).toBe(0);
  });

  it('supers on a confirm with a full bar after its reaction delay, facing the opponent', () => {
    const t = new ArcadeTactics();
    const c = counter();
    const stunned = { meter: SUPER_COST, oppStun: 20 };
    expect(t.apply(view(stunned, 100), cmd, c.draw) & Cmd.super).toBe(0);
    expect(t.apply(view(stunned, 100 + ARCADE_AI_REACTION_MIN - 1), cmd, c.draw) & Cmd.super).toBe(0);
    expect(t.apply(view(stunned, 100 + ARCADE_AI_REACTION_MIN), cmd, c.draw)).toBe(Cmd.super | Cmd.right);
    expect(c.calls).toBe(1); // one reaction draw per confirm
  });

  it('does not super without the meter, while stunned, casting, recovering, or off the band', () => {
    const late = 100;
    const no = (a: Partial<ArcadeView>, self?: FighterView, opp?: FighterView): void => {
      const t = new ArcadeTactics();
      t.apply(view(a, 0, self, opp), cmd, () => 0);
      expect(t.apply(view(a, late, self, opp), cmd, () => 0) & Cmd.super).toBe(0);
    };
    no({ meter: SUPER_COST - 1, oppStun: 20 });
    no({ meter: SUPER_COST, oppStun: 20, selfStun: 3 });
    no({ meter: SUPER_COST, oppStun: 20, superActive: true });
    no({ meter: SUPER_COST, oppStun: 20 }, fighter(200, 300, 1 | 4));
    no({ meter: SUPER_COST, oppStun: 20 }, fighter(200, 300), fighter(700, 600));
  });

  it('a new stun is a new confirm with a fresh reaction', () => {
    const t = new ArcadeTactics();
    const c = counter();
    t.apply(view({ oppStun: 5 }, 0), cmd, c.draw);
    t.apply(view({ oppStun: 0 }, 1), cmd, c.draw);
    t.apply(view({ oppStun: 9 }, 2), cmd, c.draw);
    expect(c.calls).toBe(2);
    expect(t.save()).toEqual({ seenAt: 2, delay: ARCADE_AI_REACTION_MIN });
  });

  it('holds attacks once its combo reaches the Normal cap, and presses in during the stun below it', () => {
    expect(new ArcadeTactics().apply(view({ oppStun: 10, combo: ARCADE_AI_COMBO_CAP }), cmd, () => 0)).toBe(Cmd.left);
    expect(new ArcadeTactics().apply(view({ oppStun: 10, combo: 1 }), Cmd.secondary, () => 0)).toBe(Cmd.secondary | Cmd.right);
  });

  it('save/load round-trips through JSON', () => {
    const t = new ArcadeTactics();
    t.apply(view({ oppStun: 5 }, 42), cmd, () => 3);
    const copy = new ArcadeTactics();
    copy.load(JSON.parse(JSON.stringify(t.save())) as ReturnType<ArcadeTactics['save']>);
    expect(copy.save()).toEqual({ seenAt: 42, delay: ARCADE_AI_REACTION_MIN + 3 });
    copy.load(null);
    expect(copy.save()).toEqual(new ArcadeTactics().save());
    expect(() => {
      copy.load(7);
    }).toThrow(TypeError);
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

  it('pressStep closes in along the shared axis only, and never turns a shot', () => {
    const self = fighter(200, 300);
    expect(pressStep(self, fighter(700, 320), Cmd.up)).toBe(Cmd.right);
    expect(pressStep(self, fighter(210, 700), 0)).toBe(Cmd.down);
    expect(pressStep(self, fighter(300, 300), Cmd.up)).toBe(Cmd.up); // already close
    expect(pressStep(self, fighter(700, 700), Cmd.up)).toBe(Cmd.up); // no shared axis
    expect(pressStep(self, fighter(700, 300), Cmd.primary | Cmd.up)).toBe(Cmd.primary | Cmd.up);
  });
});

describe('Classic decisions are untouched', () => {
  it('a Classic match never gives the layer an arcade view, so it is the identity', () => {
    const world = createMatch(SETUP);
    const t = new ArcadeTactics();
    const c = counter();
    for (let i = 0; i < 300; i++) {
      for (const side of [0, 1] as const) {
        const v = createObservationView(world, side);
        expect(v.arcade).toBeUndefined();
        expect(t.apply(v, i & 0x3f, c.draw)).toBe(i & 0x3f);
      }
      step(world, [Cmd.primary | Cmd.right, Cmd.primary | Cmd.left]);
    }
    expect(c.calls).toBe(0);
  });
});
