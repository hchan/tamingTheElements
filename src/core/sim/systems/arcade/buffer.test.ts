import { describe, expect, it } from 'vitest';
import { BUFFER_TICKS, SUPER_CHORD_TICKS, SUPER_COST } from '../../../data/arcade';
import { characterId } from '../../../data/ids';
import { DEFAULT_SIM_FLAGS } from '../../../flags';
import { now } from '../../clock';
import { Cmd, type Command } from '../../commands';
import { SimEventKind } from '../../events';
import { hash } from '../../hash';
import { createMatch, type MatchSetup } from '../../match';
import { createSnapshotBuf, restore, snapshot } from '../../snapshot';
import {
  ARCADE_T, ARCADE_TEAM_BASE, ARCADE_WORLD_BASE, ArcadeE, ArcadeT, ArcadeW, cooldownIdx, World,
} from '../../state';
import { step } from '../../step';
import type { SimWorld } from '../../world';
import { bufferedCmd, CHORD_FLAG, Press, pressAge, recordPresses, usePress } from './buffer';

const P = Cmd.primary;
const S = Cmd.secondary;
const IDLE: readonly [Command, Command] = [0, 0];
const team0 = (f: number): number => ARCADE_TEAM_BASE + f;
/** Window edges: window - 1, window and window + 1. */
const edges = (w: number): number[] => [w - 1, w, w + 1];

/**
 * Sindarosa (id 0: Fire Blast, a projectile, then Translucent Flame, a buff) against Pax (id 1) two rows lower, so no
 * shot lands and no hit-stop moves the clock. Team 0 has `meter`.
 */
function duel(arcade = true, meter = 0): SimWorld {
  const setup: MatchSetup = {
    simVersion: 11, seed: 5, flags: { ...DEFAULT_SIM_FLAGS, rulesetArcade: arcade }, chapter: 1, difficulty: 1,
    p1: [{ character: characterId('sindarosa'), xp: 1 }],
    p2: [{ character: characterId('pax'), xp: 1 }],
  };
  const world = createMatch(setup);
  world.state.x[0] = 300;
  world.state.y[0] = 150;
  world.state.x[1] = 900;
  world.state.y[1] = 500;
  if (arcade) world.state.arcade[team0(ArcadeT.meter)] = meter;
  return world;
}

/** Steps `cmds` (team 0's commands; team 1 idle) and returns the game ticks at which slot `slot` was cast. */
function castTicks(world: SimWorld, cmds: readonly Command[], slot = 0): number[] {
  const s = world.state;
  const out: number[] = [];
  for (const c of cmds) {
    const g = now(s);
    const before = s.abil[cooldownIdx(0, slot)];
    step(world, [c, 0]);
    if (s.abil[cooldownIdx(0, slot)] !== before) out.push(g);
  }
  return out;
}

/** A one-tick press of `bit` followed by `n - 1` idle ticks. */
const tap = (bit: Command, n: number): Command[] => [bit, ...Array.from({ length: n - 1 }, () => 0)];

/** Steps `cmds` for team 0 and returns the game ticks of team 0's `superStarted` events. */
function superTicks(world: SimWorld, cmds: readonly Command[]): number[] {
  const out: number[] = [];
  for (const c of cmds) {
    const g = now(world.state);
    if (step(world, [c, 0]).some((e) => e.kind === SimEventKind.superStarted && e['caster'] === 0)) out.push(g);
  }
  return out;
}

describe('input windows table (FUN-DESIGN 2.12)', () => {
  it('has the design numbers', () => {
    expect([BUFFER_TICKS, SUPER_CHORD_TICKS]).toEqual([8, 3]);
  });
});

describe('input buffer (rule: a press that cannot run now runs on the first tick it can, within 8 ticks)', () => {
  it('a tap on cooldown fires when the cooldown ends, at window - 1 and window, never at window + 1', () => {
    for (const k of edges(BUFFER_TICKS)) {
      const world = duel();
      const g0 = now(world.state);
      world.state.abil[cooldownIdx(0, 0)] = g0 + k;
      expect(castTicks(world, tap(P, 20))).toEqual(k <= BUFFER_TICKS ? [g0 + k] : []);
    }
  });

  it('a tap while stunned fires on the first free tick, within the window only', () => {
    for (const k of edges(BUFFER_TICKS)) {
      const world = duel();
      const g0 = now(world.state);
      world.state.arcade[ArcadeE.stunUntil] = g0 + k;
      expect(castTicks(world, tap(P, 20))).toEqual(k <= BUFFER_TICKS ? [g0 + k] : []);
    }
  });

  it('a buffered secondary (a buff) fires the same way', () => {
    for (const k of edges(BUFFER_TICKS)) {
      const world = duel();
      const g0 = now(world.state);
      world.state.abil[cooldownIdx(0, 1)] = g0 + k;
      expect(castTicks(world, tap(S, 20), 1)).toEqual(k <= BUFFER_TICKS ? [g0 + k] : []);
    }
  });

  it('a freeze does not age a press: the window counts game ticks', () => {
    for (const k of edges(BUFFER_TICKS)) {
      const world = duel();
      const s = world.state;
      const g0 = now(s);
      // 20 frozen W.ticks (more than the window), pressed in the middle of them.
      s.arcade[ARCADE_WORLD_BASE + ArcadeW.freezeUntil] = (s.world[World.tick] ?? 0) + 20;
      s.abil[cooldownIdx(0, 0)] = g0 + k;
      const cmds = [...Array.from({ length: 10 }, () => 0), ...tap(P, 30)];
      expect(castTicks(world, cmds)).toEqual(k <= BUFFER_TICKS ? [g0 + k] : []);
    }
  });

  it('a buffered press is used once', () => {
    const world = duel();
    const s = world.state;
    const g0 = now(s);
    s.abil[cooldownIdx(0, 0)] = g0 + 2;
    expect(castTicks(world, tap(P, 3))).toEqual([g0 + 2]);
    s.abil[cooldownIdx(0, 0)] = now(s); // ready again inside the press's window
    expect(castTicks(world, tap(0, 6))).toEqual([]);
    expect(bufferedCmd(s, 0, 0)).toBe(0);
  });

  it('a press that fired at once is used too, and holding keeps the old hold-to-fire behaviour', () => {
    const world = duel();
    const s = world.state;
    const g0 = now(s);
    expect(castTicks(world, tap(P, 1))).toEqual([g0]);
    s.abil[cooldownIdx(0, 0)] = now(s) + 1;
    expect(castTicks(world, tap(0, 4))).toEqual([]);
    s.abil[cooldownIdx(0, 0)] = now(s) + 1;
    const g1 = now(s);
    expect(castTicks(world, [P, P, P])).toEqual([g1 + 1]);
  });

  it('a super press waits for the meter or the stun, within the window', () => {
    for (const k of edges(BUFFER_TICKS)) {
      const world = duel(true, SUPER_COST);
      const g0 = now(world.state);
      world.state.arcade[ArcadeE.stunUntil] = g0 + k;
      expect(superTicks(world, tap(Cmd.super, 20))).toEqual(k <= BUFFER_TICKS ? [g0 + k] : []);
    }
    const world = duel(true, 0);
    const g0 = now(world.state);
    superTicks(world, tap(Cmd.super, 3));
    world.state.arcade[team0(ArcadeT.meter)] = SUPER_COST;
    expect(superTicks(world, tap(0, 10))).toEqual([g0 + 3]);
  });

  it('Classic has no buffer: the tap is lost and the command is untouched', () => {
    const world = duel(false);
    const s = world.state;
    expect(s.arcade.length).toBe(0);
    s.abil[cooldownIdx(0, 0)] = (s.world[World.tick] ?? 0) + 2;
    expect(castTicks(world, tap(P, 12))).toEqual([]);
    expect(bufferedCmd(s, 0, P | Cmd.left)).toBe(P | Cmd.left);
    recordPresses(s, [P, S]);
    expect(s.arcade.length).toBe(0);
  });
});

describe('super chord (rule: primary and secondary within 3 ticks are a super press)', () => {
  it('fires at window - 1 and window apart, not at window + 1', () => {
    for (const d of edges(SUPER_CHORD_TICKS)) {
      const world = duel(true, SUPER_COST);
      const g0 = now(world.state);
      const cmds = [P, ...Array.from({ length: d - 1 }, () => 0), ...tap(S, 5)];
      expect(superTicks(world, cmds)).toEqual(d <= SUPER_CHORD_TICKS ? [g0 + d] : []);
    }
  });

  it('a same-tick chord is only the super: neither attack casts', () => {
    const world = duel(true, SUPER_COST);
    const s = world.state;
    const ev = step(world, [P | S, 0]);
    expect(ev.filter((e) => e.kind === SimEventKind.superStarted)).toHaveLength(1);
    expect([s.abil[cooldownIdx(0, 0)], s.abil[cooldownIdx(0, 1)]]).toEqual([0, 0]);
    expect(s.arcade[team0(ArcadeT.meter)]).toBe(0);
  });

  it('is two attacks without the meter or while a super runs', () => {
    const world = duel(true, SUPER_COST - 1);
    expect(superTicks(world, [P | S])).toEqual([]);
    expect(world.state.abil[cooldownIdx(0, 0)]).toBeGreaterThan(0);
    expect(world.state.abil[cooldownIdx(0, 1)]).toBeGreaterThan(0);
    const busy = duel(true, SUPER_COST);
    busy.state.arcade[team0(ArcadeT.superState)] = 40;
    recordPresses(busy.state, [P | S, 0]);
    expect(pressAge(busy.state, 0, Press.super)).toBe(-1);
  });

  it('masks the held buttons while its super press waits, and the super runs when the stun ends', () => {
    const world = duel(true, SUPER_COST);
    const s = world.state;
    const g0 = now(s);
    s.arcade[ArcadeE.stunUntil] = g0 + 5;
    s.abil[cooldownIdx(0, 0)] = 0;
    expect(superTicks(world, Array.from({ length: 10 }, () => P | S))).toEqual([g0 + 5]);
    expect(s.abil[cooldownIdx(0, 0)]).toBe(0); // no Fire Blast came out of the held chord
  });

  it('each press feeds one chord, and the chord flag needs a pending super press', () => {
    const world = duel(true, 2 * SUPER_COST);
    const s = world.state;
    recordPresses(s, [P | S, 0]);
    expect([pressAge(s, 0, Press.primary), pressAge(s, 0, Press.secondary), pressAge(s, 0, Press.super)]).toEqual([-1, -1, 0]);
    expect((s.arcade[team0(ArcadeT.pressUsed)] ?? 0) & CHORD_FLAG).toBe(CHORD_FLAG);
    expect(bufferedCmd(s, 0, P | S)).toBe(Cmd.super);
    usePress(s, 0, Press.super);
    expect(bufferedCmd(s, 0, P | S)).toBe(P | S);
    recordPresses(s, [P, 0]);
    recordPresses(s, [P | S, 0]); // S again with P held: P's press already fed a chord
    expect(bufferedCmd(s, 0, P | S)).toBe(P | S);
  });
});

describe('buffer state is world state', () => {
  it('snapshot and restore mid-buffer replay the same hashes, and reading the command is pure', () => {
    const world = duel();
    const s = world.state;
    s.abil[cooldownIdx(0, 0)] = now(s) + 5;
    step(world, [P, 0]);
    step(world, IDLE);
    const before = hash(s);
    expect(bufferedCmd(s, 0, 0)).toBe(P);
    expect(bufferedCmd(s, 0, 0)).toBe(P);
    expect(hash(s)).toBe(before);
    const buf = createSnapshotBuf(s);
    snapshot(s, buf);
    const copy = duel();
    restore(copy.state, buf);
    const a = castTicks(world, tap(0, 10));
    expect(castTicks(copy, tap(0, 10))).toEqual(a);
    expect(a).toHaveLength(1);
    expect(hash(copy.state)).toBe(hash(s));
    expect(ArcadeT.pressUsed).toBeLessThan(ARCADE_T);
  });
});
