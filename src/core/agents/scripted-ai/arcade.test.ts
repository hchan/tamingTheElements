import { describe, expect, it } from 'vitest';
import { SUPER_CHORD_TICKS, SUPER_COST } from '../../data/arcade';
import { characterId } from '../../data/ids';
import { DEFAULT_SIM_FLAGS } from '../../flags';
import { Cmd } from '../../sim/commands';
import { hash } from '../../sim/hash';
import { createMatch, type MatchSetup } from '../../sim/match';
import { ARCADE_E, ARCADE_T, ARCADE_TEAM_BASE, ARCADE_WORLD_BASE, ArcadeE, ArcadeT, ArcadeW, World } from '../../sim/state';
import { step } from '../../sim/step';
import { createObservationView, type ArcadeView, type FighterView, type ObservationView } from '../agent';
import { getCharacter } from '../../data/characters';
import { collectCommands } from '../agent';
import { EntityFlag, EntityKind, MAX_ENTITIES, countIdx } from '../../sim/state';
import { SimEventKind } from '../../sim/events';
import { controlledId } from '../../sim/systems/movement';
import {
  ARCADE_AI_COMBO_CAP, ARCADE_AI_REACTION_MIN, ArcadeTactics, avoidChord, diagonalLine, pressStep, superFacing,
} from './arcade';
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
  meter: 0, oppMeter: 0, selfStun: 0, oppStun: 0, freeze: 0, combo: 0, oppCombo: 0, superActive: false, prevCmd: 0,
  primaryAge: -1, secondaryAge: -1,
};

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
    s.arcade[t(0, ArcadeT.prevCmd)] = Cmd.primary;
    s.arcade[t(0, ArcadeT.pressTick)] = g + 1 - 2;
    const before = hash(s);
    expect(createObservationView(world, 0).arcade).toEqual({
      meter: 1200, oppMeter: 300, selfStun: 0, oppStun: 14, freeze: 6, combo: 2, oppCombo: 0, superActive: true,
      prevCmd: Cmd.primary, primaryAge: 2, secondaryAge: -1,
    });
    expect(createObservationView(world, 1).arcade).toEqual({
      meter: 300, oppMeter: 1200, selfStun: 14, oppStun: 0, freeze: 6, combo: 0, oppCombo: 2, superActive: false,
      prevCmd: 0, primaryAge: -1, secondaryAge: -1,
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
    expect(new ArcadeTactics().apply(view({ meter: SUPER_COST }), both, () => 0)).toBe(Cmd.primary | Cmd.left);
    const t = new ArcadeTactics();
    t.apply(view({ meter: SUPER_COST, oppStun: 20, primaryAge: 0 }, 0), both, () => 0);
    expect(t.apply(view({ meter: SUPER_COST, oppStun: 20, primaryAge: 0 }, 50), both, () => 0)).toBe(Cmd.super | Cmd.right);
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
    const t = new ArcadeTactics();
    const diag = view({}, 0, self, fighter(500, 600));
    expect(t.apply(diag, Cmd.left, () => 0, Cmd.primary)).toBe(Cmd.primary | Cmd.right | Cmd.down);
    expect(t.apply(diag, Cmd.left, () => 0, 0)).toBe(Cmd.left); // nothing ready
    expect(t.apply(view({}, 0, self, fighter(540, 40)), Cmd.left, () => 0, Cmd.primary)).toBe(Cmd.left); // off the line
    expect(t.apply(view(undefined, 0, self, fighter(500, 600)), Cmd.left, () => 0, Cmd.primary)).toBe(Cmd.left); // Classic
    expect(t.save()).toEqual(new ArcadeTactics().save()); // no new agent state
  });

  it("keeps the base AI's 4-way shot: a second movement axis is dropped (Classic's x wins)", () => {
    const t = new ArcadeTactics();
    expect(t.apply(view({}), Cmd.primary | Cmd.left | Cmd.up, () => 0, Cmd.primary)).toBe(Cmd.primary | Cmd.left);
    expect(t.apply(view({}), Cmd.primary | Cmd.up, () => 0, Cmd.primary)).toBe(Cmd.primary | Cmd.up);
    expect(t.apply(view(undefined), Cmd.primary | Cmd.left | Cmd.up, () => 0)).toBe(Cmd.primary | Cmd.left | Cmd.up);
  });

  it('in an Arcade match the scripted AI lands a diagonal shot, and its snapshot round trip replays the same commands', () => {
    const world = createMatch({
      ...SETUP, flags: { ...DEFAULT_SIM_FLAGS, rulesetArcade: true },
      p1: [{ character: characterId('pax'), xp: 1 }], p2: [{ character: characterId('sindarosa'), xp: 1 }],
    });
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
    const replayWorld = createMatch({
      ...SETUP, flags: { ...DEFAULT_SIM_FLAGS, rulesetArcade: true },
      p1: [{ character: characterId('pax'), xp: 1 }], p2: [{ character: characterId('sindarosa'), xp: 1 }],
    });
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
