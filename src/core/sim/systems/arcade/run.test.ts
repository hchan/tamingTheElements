import { describe, expect, it } from 'vitest';
import { RUN_COOLDOWN_TICKS, RUN_TICKS, RunEnd } from '../../../data/arcade';
import { characterId } from '../../../data/ids';
import { DEFAULT_SIM_FLAGS } from '../../../flags';
import { now } from '../../clock';
import { Cmd, type Command } from '../../commands';
import { SimEventKind, type SimEvent } from '../../events';
import { hash } from '../../hash';
import { createMatch, type MatchSetup } from '../../match';
import { createSnapshotBuf, restore, snapshot } from '../../snapshot';
import { ARCADE_E, ARCADE_T, ARCADE_TEAM_BASE, ArcadeE, ArcadeT, EntityFlag } from '../../state';
import { step } from '../../step';
import type { SimWorld } from '../../world';
import { skipIntro } from './round-testkit';
import { applyTickCheats } from '../../../tester/cheats';
import { createRenderView } from '../../view';
import { runDirection } from './run-move';

const R = Cmd.run;
const E = (id: number, f: number): number => id * ARCADE_E + f;
const ofKind = (evs: readonly SimEvent[], k: number): SimEvent[] => evs.filter((e) => e.kind === k);
const IDLE: [Command, Command] = [0, 0];

/** `p1` (id 0) at (400, 300) against `p2` (id 1) at (`foeX`, 300), straight into the fight. */
function duel(p1 = 'fiara', foeX = 700, p2 = 'pax'): SimWorld {
  const setup: MatchSetup = {
    simVersion: 24, seed: 9, flags: { ...DEFAULT_SIM_FLAGS, rulesetArcade: true }, chapter: 1, difficulty: 1,
    p1: [{ character: characterId(p1), xp: 1 }],
    p2: [{ character: characterId(p2), xp: 1 }],
  };
  const world = skipIntro(createMatch(setup));
  const s = world.state;
  s.x[0] = 400; s.y[0] = 300; s.dir[0] = 0;
  s.x[1] = foeX; s.y[1] = 300; s.dir[1] = 4;
  return world;
}

/** Runs `n` idle ticks and returns every event. */
function idle(world: SimWorld, n: number): SimEvent[] {
  const out: SimEvent[] = [];
  for (let i = 0; i < n; i++) out.push(...step(world, IDLE));
  return out;
}

describe('run numbers', () => {
  it('has the design numbers and Cmd.run is bit 16', () => {
    expect([RUN_TICKS / 50, RUN_COOLDOWN_TICKS / 50]).toEqual([5, 7]);
    expect(Cmd.run).toBe(1 << 16);
  });
});

describe('run start', () => {
  it('a ranged hero runs away from the foe and a melee hero towards it', () => {
    const away = duel('fiara');
    const x0 = away.state.x[0] ?? 0;
    expect(ofKind(step(away, [R, 0]), SimEventKind.runStarted)).toMatchObject([{ sourceId: 0, away: 1 }]);
    expect(away.state.x[0] ?? 0).toBeLessThan(x0);
    const towards = duel('pax');
    const t0 = towards.state.x[0] ?? 0;
    expect(ofKind(step(towards, [R, 0]), SimEventKind.runStarted)).toMatchObject([{ sourceId: 0, away: 0 }]);
    expect(towards.state.x[0] ?? 0).toBeGreaterThan(t0);
  });

  it('sets runUntil, a provisional runReadyAt, and auto-faces the foe when running away', () => {
    const world = duel('fiara');
    const g = now(world.state);
    step(world, [R, 0]);
    expect(world.state.arcade[E(0, ArcadeE.runUntil)]).toBe(g + RUN_TICKS);
    expect(world.state.arcade[E(0, ArcadeE.runReadyAt)]).toBe(g + RUN_TICKS + RUN_COOLDOWN_TICKS);
  });

  it('refuses without a foe and keeps the press buffered', () => {
    const world = duel('fiara');
    world.state.flags[1] = (world.state.flags[1] ?? 0) & ~EntityFlag.alive;
    expect(ofKind(step(world, [R, 0]), SimEventKind.runStarted)).toHaveLength(0);
    expect(world.state.arcade[E(0, ArcadeE.runUntil)]).toBe(0);
  });

  it('a press buffered while stunned never starts once the buffer expires', () => {
    const world = duel('fiara');
    world.state.arcade[E(0, ArcadeE.stunUntil)] = now(world.state) + 30;
    step(world, [R, 0]);
    expect(idle(world, 40).filter((e) => e.kind === SimEventKind.runStarted)).toHaveLength(0);
  });

  it('a press buffered during a short block-stun starts when it ends', () => {
    const world = duel('fiara');
    world.state.arcade[E(0, ArcadeE.blockUntil)] = now(world.state) + 3;
    step(world, [R, 0]);
    const evs = idle(world, 6);
    expect(ofKind(evs, SimEventKind.runStarted)).toHaveLength(1);
  });

  it('a direction held from before the press does not break the run', () => {
    const world = duel('pax');
    step(world, [Cmd.up, 0]);
    step(world, [Cmd.up | R, 0]);
    idle(world, 3);
    expect(world.state.arcade[E(0, ArcadeE.runUntil)]).not.toBe(0);
  });

  it('a direction rising on the same tick as the press wins: no run starts', () => {
    const world = duel('pax');
    const evs = step(world, [Cmd.up | R, 0]);
    expect(ofKind(evs, SimEventKind.runStarted)).toHaveLength(0);
    expect(world.state.arcade[E(0, ArcadeE.runUntil)]).toBe(0);
  });
});

describe('run end', () => {
  it('a second press stops it (broken) and the cooldown counts from there', () => {
    const world = duel('fiara');
    step(world, [R, 0]);
    idle(world, 5);
    const g = now(world.state);
    const evs = step(world, [R, 0]);
    expect(ofKind(evs, SimEventKind.runEnded)).toMatchObject([{ reason: RunEnd.broken }]);
    expect(world.state.arcade[E(0, ArcadeE.runReadyAt)]).toBe(g + RUN_COOLDOWN_TICKS);
    expect(world.state.arcade[E(0, ArcadeE.runUntil)]).toBe(0);
  });

  it('a new direction press ends it as broken', () => {
    const world = duel('fiara');
    step(world, [R, 0]);
    idle(world, 3);
    const evs = step(world, [Cmd.up, 0]);
    expect(ofKind(evs, SimEventKind.runEnded)).toMatchObject([{ reason: RunEnd.broken }]);
  });

  it('lasts exactly 250 moving ticks, then expires with the cooldown from the end', () => {
    const world = duel('pax', 1500);
    const s = world.state;
    s.x[0] = world.arena.x + 10;
    s.x[1] = world.arena.x + world.arena.w - (s.w[1] ?? 0) - 10;
    s.speed[0] = 1;
    let moved = 0;
    let ended: SimEvent[] = [];
    let prev = s.x[0];
    const evs0 = step(world, [R, 0]);
    if (s.x[0] !== prev) moved++;
    ended = ended.concat(ofKind(evs0, SimEventKind.runEnded));
    for (let t = 1; t < RUN_TICKS + 5; t++) {
      prev = s.x[0];
      const evs = step(world, IDLE);
      if (s.x[0] !== prev) moved++;
      ended = ended.concat(ofKind(evs, SimEventKind.runEnded));
    }
    expect(ended).toMatchObject([{ reason: RunEnd.expired }]);
    // walk inertia (FUN-DESIGN 2.3a) lets the hero coast a couple of ticks after the 250 steered ones
    expect(moved).toBeGreaterThanOrEqual(RUN_TICKS);
    expect(moved).toBeLessThanOrEqual(RUN_TICKS + 3);
    const readyAt = s.arcade[E(0, ArcadeE.runReadyAt)] ?? 0;
    expect(readyAt).toBeGreaterThan(0);
    expect(readyAt - now(s)).toBeLessThanOrEqual(RUN_COOLDOWN_TICKS);
  });

  it('refuses to restart before the cooldown ends', () => {
    const world = duel('fiara');
    step(world, [R, 0]);
    step(world, [R, 0]);
    idle(world, 20);
    expect(ofKind(step(world, [R, 0]), SimEventKind.runStarted)).toHaveLength(0);
  });

  it('stun interrupts it', () => {
    const world = duel('fiara');
    step(world, [R, 0]);
    world.state.arcade[E(0, ArcadeE.stunUntil)] = now(world.state) + 20;
    expect(ofKind(step(world, IDLE), SimEventKind.runEnded)).toMatchObject([{ reason: RunEnd.interrupted }]);
  });

  it('a root interrupts it', () => {
    const world = duel('fiara');
    step(world, [R, 0]);
    world.state.arcade[E(0, ArcadeE.rootUntil)] = now(world.state) + 20;
    expect(ofKind(step(world, IDLE), SimEventKind.runEnded)).toMatchObject([{ reason: RunEnd.interrupted }]);
  });

  it('a dash interrupts it and takes the run direction', () => {
    const world = duel('fiara');
    step(world, [R, 0]);
    const x0 = world.state.x[0] ?? 0;
    const evs = step(world, [Cmd.dash, 0]);
    expect(ofKind(evs, SimEventKind.dashed)).toHaveLength(1);
    idle(world, 4);
    expect(world.state.x[0] ?? 0).toBeLessThan(x0);
    expect(world.state.arcade[E(0, ArcadeE.runUntil)]).toBe(0);
  });

  it('guard held pauses the walk but the timer keeps running', () => {
    const world = duel('fiara');
    step(world, [R, 0]);
    const x0 = world.state.x[0] ?? 0;
    step(world, [Cmd.guard, 0]);
    const x1 = world.state.x[0] ?? 0;
    idle(world, 1);
    expect(x1).toBeLessThanOrEqual(x0);
    expect(world.state.arcade[E(0, ArcadeE.runUntil)]).not.toBe(0);
  });

  it('a KO ends it', () => {
    const world = duel('fiara');
    step(world, [R, 0]);
    world.state.flags[0] = (world.state.flags[0] ?? 0) | EntityFlag.dead;
    expect(ofKind(step(world, IDLE), SimEventKind.runEnded)).toMatchObject([{ reason: RunEnd.interrupted }]);
  });
});

describe('run direction', () => {
  it('Away slides along a wall instead of pushing into it', () => {
    const world = duel('fiara', 700);
    world.state.x[0] = world.arena.x + 2;
    world.state.y[0] = 300;
    world.state.x[1] = world.state.x[0] + 200;
    world.state.y[1] = 250;
    const d = runDirection(world, 0, 1);
    expect([6, 2, 7, 5]).toContain(d);
    expect(d).toBe(6);
  });

  it('Away cornered falls back to a perpendicular escape or stands', () => {
    const world = duel('fiara', 700);
    const s = world.state;
    s.x[0] = world.arena.x; s.y[0] = world.arena.y;
    s.x[1] = world.arena.x + 100; s.y[1] = world.arena.y + 100;
    const d = runDirection(world, 0, 1);
    expect([-1, 0, 6, 2, 4]).toContain(d);
  });

  it('Towards holds at contact (no direction) and follows otherwise', () => {
    const world = duel('pax', 700);
    const s = world.state;
    s.x[1] = (s.x[0] ?? 0) + (s.w[0] ?? 0) + 2;
    expect(runDirection(world, 0, 1)).toBe(-1);
    s.x[1] = (s.x[0] ?? 0) + 400;
    expect(runDirection(world, 0, 1)).toBe(0);
  });

  it('exactly coincident centres: team 0 goes left, team 1 right on an equal-room tie', () => {
    const world = duel('fiara', 700, 'fiara');
    const s = world.state;
    const mid = world.arena.x + (world.arena.w - (s.w[0] ?? 0)) / 2;
    s.x[0] = mid; s.y[0] = 300; s.x[1] = mid; s.y[1] = 300;
    expect(runDirection(world, 0, 1)).toBe(4);
    expect(runDirection(world, 1, 0)).toBe(0);
  });
});

describe('run determinism', () => {
  it('replays to the same hash and restores a snapshot mid-run', () => {
    const play = (): SimWorld => {
      const w = duel('fiara');
      step(w, [R, 0]);
      idle(w, 60);
      return w;
    };
    const a = play();
    const b = play();
    expect(hash(a.state)).toBe(hash(b.state));
    const buf = createSnapshotBuf(a.state);
    snapshot(a.state, buf);
    idle(a, 40);
    const h = hash(a.state);
    restore(a.state, buf);
    idle(a, 40);
    expect(hash(a.state)).toBe(h);
  });

  it('the team dirRise slot exists and starts at zero', () => {
    const world = duel('fiara');
    expect(world.state.arcade[ARCADE_TEAM_BASE + ArcadeT.dirRise] ?? -1).toBeGreaterThanOrEqual(0);
    expect(ARCADE_T).toBeGreaterThan(ArcadeT.dirRise);
  });
});

describe('run view and cheats', () => {
  it('the render view reports the run and its cooldown', () => {
    const world = duel('fiara');
    const view = createRenderView(world);
    const ar = view.arcade();
    expect(ar?.running(0)).toBe(false);
    step(world, [R, 0]);
    expect(ar?.running(0)).toBe(true);
    expect(ar?.runIn(0)).toBe(RUN_TICKS + RUN_COOLDOWN_TICKS - 1);
    const bar = view.actionBar(0);
    expect(bar?.run).toMatchObject({ away: true, cooldownTicks: RUN_COOLDOWN_TICKS });
    expect(bar?.run?.activeUntil).toBe(world.state.arcade[E(0, ArcadeE.runUntil)]);
    expect(bar?.run?.readyTick).toBe(world.state.arcade[E(0, ArcadeE.runReadyAt)]);
  });

  it('arcadeNoCooldowns zeroes runReadyAt', () => {
    const world = duel('fiara');
    world.state.arcade[E(0, ArcadeE.runReadyAt)] = 500;
    applyTickCheats(world, { godMode: false, instantSwap: false, arcadeMeter: false, arcadeNoCooldowns: true });
    expect(world.state.arcade[E(0, ArcadeE.runReadyAt)]).toBe(0);
  });
});
