import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  BUFFER_TICKS, DASH_CANCEL_TICKS, DASH_COOLDOWN_TICKS, DASH_INVULN_FROM, DASH_INVULN_TO, DASH_RECOVERY_TICKS,
  DASH_SPEED_MULT, DASH_TICKS, DOUBLE_TAP_TICKS, METER_PERFECT_DODGE,
} from '../../../data/arcade';
import { CHARACTERS } from '../../../data/characters';
import { characterId } from '../../../data/ids';
import { DEFAULT_SIM_FLAGS } from '../../../flags';
import { isFrozen, now } from '../../clock';
import { Cmd, inputMaskFor, type Command } from '../../commands';
import { SimEventKind, type SimEvent } from '../../events';
import { hash } from '../../hash';
import { createMatch, type MatchSetup } from '../../match';
import { createSnapshotBuf, restore, snapshot } from '../../snapshot';
import {
  ARCADE_E, ARCADE_T, ARCADE_TEAM_BASE, ARCADE_WORLD_BASE, ArcadeE, ArcadeT, ArcadeW, EntityFlag, EntityKind, MAX_ENTITIES,
  World,
} from '../../state';
import { step } from '../../step';
import type { SimWorld } from '../../world';
import { skipIntro } from './round-testkit';
import { canAct, dashTick, isInvulnerable } from './stun';

const D = Cmd.dash;
const R = Cmd.right;
const E = (id: number, f: number): number => id * ARCADE_E + f;
const T = (team: number, f: number): number => ARCADE_TEAM_BASE + team * ARCADE_T + f;
/** Window edges: window - 1, window and window + 1. */
const edges = (w: number): number[] => [w - 1, w, w + 1];
const idle = (n: number): Command[] => Array.from({ length: n }, () => 0);
/** A one-tick press of `bit` followed by `n - 1` idle ticks. */
const tap = (bit: Command, n: number): Command[] => [bit, ...idle(n - 1)];

/** `p1` (id 0) at (300, 300) facing east against `p2` (id 1) at (900, 300) facing west, straight into the fight. */
function duel(p1 = 'sindarosa', p2 = 'pax', arcade = true): SimWorld {
  const setup: MatchSetup = {
    simVersion: 13, seed: 9, flags: { ...DEFAULT_SIM_FLAGS, rulesetArcade: arcade }, chapter: 1, difficulty: 1,
    p1: [{ character: characterId(p1), xp: 1 }],
    p2: [{ character: characterId(p2), xp: 1 }],
  };
  const world = skipIntro(createMatch(setup));
  const s = world.state;
  s.x[0] = 300; s.y[0] = 300; s.dir[0] = 0;
  s.x[1] = 900; s.y[1] = 300; s.dir[1] = 4;
  return world;
}

/** Steps `cmds` for team 0 (team 1 idle) and returns the game ticks of team 0's `dashed` events. */
function dashTicks(world: SimWorld, cmds: readonly Command[]): number[] {
  const out: number[] = [];
  for (const c of cmds) {
    const g = now(world.state);
    if (step(world, [c, 0]).some((e) => e.kind === SimEventKind.dashed && e.sourceId === 0)) out.push(g);
  }
  return out;
}

describe('dash table (FUN-DESIGN 2.7, 2.12)', () => {
  it('has the design numbers', () => {
    expect([DASH_TICKS, DASH_SPEED_MULT, DASH_INVULN_FROM, DASH_INVULN_TO, DASH_RECOVERY_TICKS, DASH_COOLDOWN_TICKS])
      .toEqual([12, 3, 2, 7, 6, 30]);
    expect([DOUBLE_TAP_TICKS, DASH_CANCEL_TICKS, METER_PERFECT_DODGE]).toEqual([12, 10, 100]);
  });

  it('Cmd.dash is bit 11, Arcade only', () => {
    expect(Cmd.dash).toBe(1 << 11);
    expect(inputMaskFor({ rulesetArcade: false }) & Cmd.dash).toBe(0);
    expect(inputMaskFor({ rulesetArcade: true }) & Cmd.dash).toBe(Cmd.dash);
  });
});

describe('dash movement (rule: 12 ticks at 3x speed along the held direction, else the aim)', () => {
  const speed = (CHARACTERS.find((c) => c.id === 'sindarosa')?.speed ?? 0) * DASH_SPEED_MULT;

  it('moves 3x speed per tick for exactly 12 ticks along the held direction, ignoring input meanwhile', () => {
    const world = duel();
    const s = world.state;
    const g0 = now(s);
    const evs = step(world, [D | R, 0]);
    expect(evs.filter((e) => e.kind === SimEventKind.dashed)).toMatchObject([{ sourceId: 0, dir: 0 }]);
    expect(s.x[0]).toBe(300 + speed);
    const xs = [s.x[0]];
    for (let t = 1; t < 16; t++) {
      step(world, [Cmd.left, 0]);
      xs.push(s.x[0]);
    }
    expect(xs.slice(0, DASH_TICKS)).toEqual(Array.from({ length: DASH_TICKS }, (_, k) => 300 + (k + 1) * speed));
    // Ticks 13..16 are recovery (6 ticks): the held left does not move it yet.
    expect(xs.slice(DASH_TICKS)).toEqual(idle(4).map(() => 300 + DASH_TICKS * speed));
    expect(s.y[0]).toBe(300);
    expect(s.arcade[E(0, ArcadeE.dashUntil)]).toBe(g0 + DASH_TICKS);
    expect(s.arcade[E(0, ArcadeE.dashReadyAt)]).toBe(g0 + DASH_COOLDOWN_TICKS);
  });

  it('a diagonal moves +-3x speed on both axes; with no direction held it follows the aim', () => {
    const world = duel();
    const s = world.state;
    step(world, [D | Cmd.down | R, 0]);
    expect([s.x[0], s.y[0]]).toEqual([300 + speed, 300 + speed]);
    const fresh = duel();
    step(fresh, [Cmd.up | Cmd.left, 0]); // aim north-west, one walking step
    const [x, y] = [fresh.state.x[0] ?? 0, fresh.state.y[0] ?? 0];
    const evs = step(fresh, [D, 0]);
    expect(evs.find((e) => e.kind === SimEventKind.dashed)?.['dir']).toBe(3);
    expect([fresh.state.x[0], fresh.state.y[0]]).toEqual([x - speed, y - speed]);
  });

  it('stops at the arena wall', () => {
    const world = duel();
    world.state.x[0] = 1100;
    dashTicks(world, tap(D | R, 14));
    expect(world.state.x[0]).toBe(world.arena.x + world.arena.w - 80);
  });

  it('a freeze does not age the dash: it lasts 12 game ticks', () => {
    const world = duel();
    const s = world.state;
    step(world, [D | R, 0]);
    s.arcade[ARCADE_WORLD_BASE + ArcadeW.freezeUntil] = (s.world[World.tick] ?? 0) + 20;
    for (let t = 0; t < 40; t++) step(world, [0, 0]);
    expect(s.x[0]).toBe(300 + DASH_TICKS * speed);
  });
});

describe('dash timing (rule: invulnerable on dash ticks 2..7, 6 ticks of recovery, ready 30 ticks after the start)', () => {
  it('is invulnerable on dash ticks 2..7 exactly', () => {
    const world = duel();
    const s = world.state;
    const g0 = now(s);
    // Dash tick 1 is the start tick: vulnerable.
    s.arcade[E(0, ArcadeE.dashUntil)] = g0 + DASH_TICKS;
    expect([dashTick(s, 0), isInvulnerable(s, 0)]).toEqual([1, false]);
    s.arcade[E(0, ArcadeE.dashUntil)] = 0;
    step(world, [D | R, 0]);
    for (let k = 2; k <= DASH_TICKS + 2; k++) {
      expect([k, dashTick(s, 0)]).toEqual([k, k <= DASH_TICKS ? k : 0]);
      expect([k, isInvulnerable(s, 0)]).toEqual([k, k >= DASH_INVULN_FROM && k <= DASH_INVULN_TO]);
      step(world, [0, 0]);
    }
  });

  it('cannot act during the dash and its 6 recovery ticks: free again at start + 18', () => {
    const world = duel();
    const s = world.state;
    const g0 = now(s);
    step(world, [D | R, 0]);
    const free: [number, boolean][] = [];
    while (now(s) <= g0 + DASH_TICKS + DASH_RECOVERY_TICKS + 1) {
      free.push([now(s) - g0, canAct(world, 0)]);
      step(world, [0, 0]);
    }
    expect(free.filter(([, f]) => f).map(([t]) => t)).toEqual([18, 19]);
  });

  it('the next dash is ready 30 ticks after the start; an earlier press runs then if within the 8-tick buffer', () => {
    for (const k of [0, 1, ...edges(BUFFER_TICKS)]) {
      const world = duel();
      const g0 = now(world.state);
      const ready = g0 + DASH_COOLDOWN_TICKS;
      const cmds = [...tap(D, DASH_COOLDOWN_TICKS - k), ...tap(D, 20)];
      expect([k, dashTicks(world, cmds)]).toEqual([k, k <= BUFFER_TICKS ? [g0, ready] : [g0]]);
    }
  });

  it('a press while stunned dashes on the first free tick, within the buffer only', () => {
    for (const k of edges(BUFFER_TICKS)) {
      const world = duel();
      const g0 = now(world.state);
      world.state.arcade[E(0, ArcadeE.stunUntil)] = g0 + k;
      expect(dashTicks(world, tap(D, 20))).toEqual(k <= BUFFER_TICKS ? [g0 + k] : []);
    }
  });
});

describe('double tap (rule: the same direction pressed twice within 12 ticks)', () => {
  it('dashes on the second tap at window - 1 and window, not at window + 1', () => {
    for (const k of edges(DOUBLE_TAP_TICKS)) {
      const world = duel();
      const g0 = now(world.state);
      expect([k, dashTicks(world, [...tap(R, k), ...tap(R, 5)])]).toEqual([k, k <= DOUBLE_TAP_TICKS ? [g0 + k] : []]);
    }
  });

  it('two different directions do not dash, and a pair is used once (the third tap starts a new pair)', () => {
    expect(dashTicks(duel(), [...tap(R, 4), ...tap(Cmd.left, 4)])).toEqual([]);
    const world = duel();
    const s = world.state;
    const g0 = now(s);
    expect(dashTicks(world, [...tap(R, 3), ...tap(R, 3)])).toEqual([g0 + 3]);
    expect(s.arcade[T(0, ArcadeT.lastDirPress)]).toBe(0);
    // A third tap after the cooldown pairs with nothing; a fourth within the window dashes again.
    const g1 = g0 + DASH_COOLDOWN_TICKS;
    while (now(s) < g1) step(world, [0, 0]);
    expect(dashTicks(world, [...tap(R, 3), ...tap(R, 3)])).toEqual([g1 + 3]);
  });

  it('holding a direction is one press, not a double tap', () => {
    expect(dashTicks(duel(), Array.from({ length: 30 }, () => R))).toEqual([]);
  });
});

describe('perfect dodge (rule: an enemy projectile overlapping the dasher on its invulnerable ticks, once per dash)', () => {
  /** Team 1 (Sindarosa) fires a Fire Blast; returns its entity id. */
  function shoot(world: SimWorld, team0: Command): number {
    step(world, [team0, Cmd.primary]);
    const s = world.state;
    for (let id = 0; id < MAX_ENTITIES; id++) {
      if (s.kind[id] === EntityKind.projectile && ((s.flags[id] ?? 0) & EntityFlag.alive) !== 0) return id;
    }
    throw new Error('no projectile');
  }

  it('gives one perfectDodge and +100 meter, and the projectile flies on', () => {
    const world = duel('sindarosa', 'sindarosa');
    const s = world.state;
    const p = shoot(world, D | Cmd.up); // dash tick 1 (north) and the shot in the same tick
    s.x[p] = (s.x[0] ?? 0) + 40;
    s.y[p] = (s.y[0] ?? 0) + 30; // overlaps on dash ticks 2 and 3, then the dasher is past it
    const events: SimEvent[] = [];
    for (let t = 0; t < DASH_TICKS; t++) events.push(...step(world, [0, 0]));
    expect(events.filter((e) => e.kind === SimEventKind.perfectDodge)).toMatchObject([{ sourceId: 0, projectile: p }]);
    expect(events.some((e) => e.kind === SimEventKind.hitConfirmed)).toBe(false);
    expect(s.arcade[T(0, ArcadeT.meter)]).toBe(METER_PERFECT_DODGE);
    expect(s.arcade[E(0, ArcadeE.dashDodged)]).toBe(1);
  });

  it('a projectile overlapping on dash tick 1 hits, and the hit ends the dash', () => {
    const world = duel('sindarosa', 'sindarosa');
    const s = world.state;
    const p = shoot(world, 0);
    s.x[p] = (s.x[0] ?? 0) + 48;
    s.y[p] = (s.y[0] ?? 0) + 40;
    const evs = step(world, [D | Cmd.up, 0]);
    expect(evs.map((e) => e.kind)).toEqual(expect.arrayContaining([SimEventKind.dashed, SimEventKind.hitConfirmed]));
    expect(evs.some((e) => e.kind === SimEventKind.perfectDodge)).toBe(false);
    while (isFrozen(s)) step(world, [0, 0]);
    expect(dashTick(s, 0)).toBe(0);
  });
});

describe('dash cancel (rule: a dash within 10 ticks of a confirmed hit cancels melee recovery)', () => {
  /** Curomo's Ice Shock (13 ticks of recovery) hits Pax 80 px away; returns the world and the confirm's game tick. */
  function confirmed(): [SimWorld, number] {
    const world = duel('curomo', 'pax');
    const s = world.state;
    s.x[1] = 380;
    s.hp[1] = 10_000;
    for (let t = 0; t < 5; t++) {
      const g = now(s);
      if (step(world, [Cmd.primary, 0]).some((e) => e.kind === SimEventKind.hitConfirmed)) return [world, g];
    }
    throw new Error('no hit');
  }

  it('cancels at window - 1 and window; at window + 1 the press waits for the recovery to end', () => {
    for (const k of edges(DASH_CANCEL_TICKS)) {
      const [world, c] = confirmed();
      const s = world.state;
      expect(((s.flags[0] ?? 0) & EntityFlag.frozen) !== 0).toBe(true);
      while (now(s) < c + k) step(world, [0, 0]);
      const cast = c - 1;
      const recoveryEnd = cast + 13;
      // Without a cancel, the melee expiry frees the caster at `recoveryEnd` (after the input slot): it dashes next tick.
      expect([k, dashTicks(world, tap(D, 10))]).toEqual([k, [k <= DASH_CANCEL_TICKS ? c + k : recoveryEnd + 1]]);
      if (k <= DASH_CANCEL_TICKS) expect(((s.flags[0] ?? 0) & EntityFlag.frozen) !== 0).toBe(false);
    }
  });

  it('a whiffed melee is no confirm: the press cannot cancel, and the buffer runs out first', () => {
    const world = duel('curomo', 'pax');
    const g0 = now(world.state);
    expect(dashTicks(world, [Cmd.primary, ...tap(D, 30)])).toEqual([]);
    expect(world.state.arcade[T(0, ArcadeT.confirmTick)]).toBe(0);
    expect(now(world.state)).toBeGreaterThan(g0 + 13 + BUFFER_TICKS);
  });
});

describe('Classic', () => {
  it('ignores the dash bit and double taps', () => {
    const a = duel('sindarosa', 'pax', false);
    const b = duel('sindarosa', 'pax', false);
    const cmds = [...tap(R, 3), ...tap(R | D, 3), ...tap(D, 3)];
    const kinds: number[] = [];
    for (const c of cmds) {
      kinds.push(...step(a, [c, c]).map((e) => e.kind));
      step(b, [c & ~D, c & ~D]);
      expect(hash(a.state)).toBe(hash(b.state));
    }
    expect(kinds.some((k) => k >= 40)).toBe(false);
    expect(a.state.x[0]).toBe(300 + 2 * (CHARACTERS.find((c) => c.id === 'sindarosa')?.speed ?? 0));
  });
});

describe('dash properties', () => {
  const race = fc.constantFrom(...CHARACTERS.filter((c) => c.id !== 'eternal-void').map((c) => c.id));
  /** Movement taps and dash presses are frequent, so dashes, cancels and dodges all happen. */
  const cmd = fc.tuple(fc.integer({ min: 0, max: 0x3f }), fc.boolean()).map(([c, d]) => c | (d ? D : 0));
  const runs = fc
    .array(fc.tuple(fc.integer({ min: 1, max: 12 }), cmd, cmd), { minLength: 1, maxLength: 40 })
    .map((rs) => rs.flatMap(([k, p, q]) => Array.from({ length: k }, (): [number, number] => [p, q])));

  it('dashes obey the rules, and re-simulate to identical hashes, also after a snapshot restore', () => {
    let dashes = 0;
    let dodges = 0;
    fc.assert(
      fc.property(race, race, runs, fc.nat(), fc.boolean(), (a, rival, raw, cut, turret) => {
        // A turret run: team 1 is a Sindarosa 300 px away that only fires west along team 0's row, so dodges happen.
        const inputs = turret ? raw.map(([p]): [number, number] => [p, Cmd.primary]) : raw;
        const make = (): SimWorld => {
          const w = duel(a, turret ? 'sindarosa' : rival);
          w.state.hp[0] = 10_000;
          w.state.hp[1] = 10_000;
          if (turret) w.state.x[1] = 600;
          return w;
        };
        const world = make();
        const s = world.state;
        const dodged = new Map<number, boolean>();
        const hashes: number[] = [];
        for (const [p, q] of inputs) {
          const g = now(s);
          const pre = [0, 1].map((id) => [dashTick(s, id), s.arcade[E(id, ArcadeE.dashReadyAt)] ?? 0] as const);
          const evs = step(world, [p, q]);
          hashes.push(hash(s));
          for (const e of evs) {
            const [tick, ready] = pre[e.sourceId] ?? [0, 0];
            if (e.kind === SimEventKind.hitConfirmed) {
              const t = pre[e['target'] ?? -1]?.[0] ?? 0;
              expect(t >= DASH_INVULN_FROM && t <= DASH_INVULN_TO).toBe(false);
            } else if (e.kind === SimEventKind.dashed) {
              dashes++;
              expect(g).toBeGreaterThanOrEqual(ready);
              expect(s.arcade[E(e.sourceId, ArcadeE.dashReadyAt)]).toBe(g + DASH_COOLDOWN_TICKS);
              dodged.set(e.sourceId, false);
            } else if (e.kind === SimEventKind.perfectDodge) {
              dodges++;
              expect(tick >= DASH_INVULN_FROM && tick <= DASH_INVULN_TO).toBe(true);
              expect(dodged.get(e.sourceId)).toBe(false);
              dodged.set(e.sourceId, true);
            }
          }
        }
        const again = make();
        const k = cut % inputs.length;
        for (const [p, q] of inputs.slice(0, k)) step(again, [p, q]);
        const buf = createSnapshotBuf(again.state);
        snapshot(again.state, buf);
        for (const [p, q] of inputs.slice(k)) step(again, [p, q]);
        restore(again.state, buf);
        const rest = inputs.slice(k).map(([p, q]) => {
          step(again, [p, q]);
          return hash(again.state);
        });
        expect(rest).toEqual(hashes.slice(k));
      }),
      { numRuns: 160, seed: 0xda54 },
    );
    expect(dashes).toBeGreaterThan(120);
    expect(dodges).toBeGreaterThan(2);
  });
});
