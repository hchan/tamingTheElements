import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  BLOCK_STUN_TICKS, BUFFER_TICKS, GUARD_BREAK_STUN_TICKS, GUARD_CHIP_PM, GUARD_DRAIN_PM, GUARD_MAX, GUARD_REGEN,
  HIT_STOP_TICKS, HitStopCause, HitStrength, KNOCKBACK_Q4, METER_BAR, METER_PARRY, PARRY_HIT_STOP_TICKS,
  PARRY_LOCK_TICKS, PARRY_STUN_TICKS, PARRY_TICKS,
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
  ARCADE_E, ARCADE_T, ARCADE_TEAM_BASE, ArcadeE, ArcadeT, cooldownIdx, countIdx, EntityFlag, EntityKind, MAX_ENTITIES,
} from '../../state';
import { step } from '../../step';
import type { SimWorld } from '../../world';
import { skipIntro } from './round-testkit';
import { canAct, isGuarding } from './stun';

const G = Cmd.guard;
const E = (id: number, f: number): number => id * ARCADE_E + f;
const T = (team: number, f: number): number => ARCADE_TEAM_BASE + team * ARCADE_T + f;
const edges = (w: number): number[] => [w - 1, w, w + 1];
const of = (ev: readonly SimEvent[], kind: number): SimEvent[] => ev.filter((e) => e.kind === kind);
/** A guard held from now lands its first hit after the parry window: `now + LATE` is a guarded (not parried) hit. */
const LATE = PARRY_TICKS + 4;

/** `p1` (id 0) at (300, 300) facing east against `p2` (id 1) at (900, 300) facing west, straight into the fight. */
function duel(p1 = 'pax', p2 = 'sindarosa', arcade = true): SimWorld {
  const setup: MatchSetup = {
    simVersion: 14, seed: 9, flags: { ...DEFAULT_SIM_FLAGS, rulesetArcade: arcade }, chapter: 1, difficulty: 1,
    p1: [{ character: characterId(p1), xp: 1 }],
    p2: [{ character: characterId(p2), xp: 1 }],
  };
  const world = skipIntro(createMatch(setup));
  const s = world.state;
  s.x[0] = 300; s.y[0] = 300; s.dir[0] = 0;
  s.x[1] = 900; s.y[1] = 300; s.dir[1] = 4;
  return world;
}

/** Steps idle (team 0 sends `c0`) until the game clock reaches `g`, frozen ticks included. */
function until(world: SimWorld, g: number, c0: Command = 0): void {
  while (now(world.state) < g || isFrozen(world.state)) step(world, [c0, 0]);
}

/**
 * Team 1 (Sindarosa) fires a Fire Blast (40, heavy) while team 0 sends `c0`, and the bullet is moved so that it
 * overlaps team 0 after its next move: the next step lands the hit. Returns the bullet's id.
 */
function shoot(world: SimWorld, c0: Command = 0): number {
  const s = world.state;
  s.abil[cooldownIdx(1, 0)] = 0; // a test may shoot again before the cooldown ran out
  const g = now(s);
  step(world, [c0, Cmd.primary]);
  for (let id = 0; id < MAX_ENTITIES; id++) {
    if (s.kind[id] !== EntityKind.projectile || ((s.flags[id] ?? 0) & EntityFlag.alive) === 0) continue;
    if (s.team[id] !== 1 || s.spawnTick[id] !== g) continue;
    s.x[id] = (s.x[0] ?? 0) + 40 - (s.vx[id] ?? 0);
    s.y[id] = (s.y[0] ?? 0) + 30;
    return id;
  }
  throw new Error('no projectile');
}

/** Lands a Fire Blast on team 0 at game tick `g` (team 0 sends `c0` throughout); returns the landing tick's events. */
function landAt(world: SimWorld, g: number, c0: Command = 0): readonly SimEvent[] {
  until(world, g - 1, c0);
  shoot(world, c0);
  expect(now(world.state)).toBe(g);
  return step(world, [c0, 0]);
}

describe('guard and parry table (FUN-DESIGN 2.8, 2.12)', () => {
  it('has the design numbers', () => {
    expect([GUARD_CHIP_PM, BLOCK_STUN_TICKS, GUARD_MAX, GUARD_DRAIN_PM, GUARD_REGEN, GUARD_BREAK_STUN_TICKS])
      .toEqual([250, 8, 1000, 8000, 5, 60]);
    expect([PARRY_TICKS, PARRY_HIT_STOP_TICKS, PARRY_STUN_TICKS, PARRY_LOCK_TICKS, METER_PARRY]).toEqual([8, 10, 20, 20, 150]);
  });

  it('Cmd.guard is bit 12, Arcade only', () => {
    expect(Cmd.guard).toBe(1 << 12);
    expect(inputMaskFor({ rulesetArcade: false }) & G).toBe(0);
    expect(inputMaskFor({ rulesetArcade: true }) & G).toBe(G);
  });
});

describe('guard (rule: hold to guard; cannot move or cast)', () => {
  it('a held guard stops movement and casting; releasing it frees the character at once', () => {
    const world = duel('sindarosa', 'pax');
    const s = world.state;
    step(world, [G | Cmd.right | Cmd.primary, 0]);
    expect(s.x[0]).toBe(300);
    expect(canAct(world, 0)).toBe(false);
    expect(isGuarding(s, 0)).toBe(true);
    let bullets = 0;
    for (let id = 0; id < MAX_ENTITIES; id++) if (s.kind[id] === EntityKind.projectile && s.flags[id] !== 0) bullets++;
    expect(bullets).toBe(0);
    step(world, [Cmd.right, 0]);
    expect(s.x[0]).toBeGreaterThan(300);
  });

  it('cannot guard while stunned or in cast recovery', () => {
    const world = duel();
    const s = world.state;
    s.arcade[E(0, ArcadeE.stunUntil)] = now(s) + 5;
    step(world, [G, 0]);
    expect(isGuarding(s, 0)).toBe(false);
    const other = duel();
    other.state.flags[0] = (other.state.flags[0] ?? 0) | EntityFlag.frozen;
    step(other, [G, 0]);
    expect(isGuarding(other.state, 0)).toBe(false);
  });
});

describe('guarded hit (rule: 250 pm chip, no hit-stun, 8 ticks of block-stun, light knockback)', () => {
  it('deals 250 pm of the unguarded damage with `guarded` instead of `hitConfirmed`, no combo, no stun', () => {
    const open = duel();
    const hit = of(landAt(open, now(open.state) + 2), SimEventKind.hitConfirmed)[0];
    expect(hit).toMatchObject({ target: 0, combo: 1, scalePm: 1000, strength: HitStrength.heavy });
    const world = duel();
    const s = world.state;
    const hp = s.hp[0] ?? 0;
    const g = now(s) + LATE;
    const ev = landAt(world, g, G);
    const chip = ((hit?.['amount'] ?? 0) * GUARD_CHIP_PM) / 1000;
    expect(of(ev, SimEventKind.hitConfirmed)).toEqual([]);
    expect(of(ev, SimEventKind.damage)).toMatchObject([{ target: 0, amount: chip }]);
    expect(of(ev, SimEventKind.guarded)).toMatchObject([{ target: 0, attacker: 1, chip }]);
    expect(of(ev, SimEventKind.hitStop)).toMatchObject([{ ticks: HIT_STOP_TICKS[HitStrength.heavy], cause: HitStopCause.hit }]);
    expect(s.hp[0]).toBe(hp - chip);
    expect(s.arcade[E(0, ArcadeE.stunUntil)]).toBe(0);
    expect(s.arcade[T(1, ArcadeT.comboHits)]).toBe(0);
    expect(s.arcade[T(1, ArcadeT.confirmTick)]).toBe(0);
    expect(s.arcade[E(0, ArcadeE.kbVx)]).toBe(-KNOCKBACK_Q4[HitStrength.light]);
    expect(s.arcade[E(0, ArcadeE.blockUntil)]).toBe(g + BLOCK_STUN_TICKS);
  });

  it('block-stun holds the character for 8 game ticks even with guard released (edges 7, 8, 9)', () => {
    const world = duel();
    const s = world.state;
    const g = now(s) + LATE;
    landAt(world, g, G);
    for (const k of edges(BLOCK_STUN_TICKS)) {
      until(world, g + k);
      expect([k, canAct(world, 0), isGuarding(s, 0)]).toEqual([k, k >= BLOCK_STUN_TICKS, k < BLOCK_STUN_TICKS]);
    }
  });

  it('a hit during block-stun is guarded even with guard released', () => {
    const world = duel();
    const g = now(world.state) + LATE;
    landAt(world, g, G);
    const ev = landAt(world, g + BLOCK_STUN_TICKS - 1);
    expect(of(ev, SimEventKind.guarded)).toHaveLength(1);
    expect(of(ev, SimEventKind.hitConfirmed)).toEqual([]);
  });
});

describe('guard meter (rule: drains floor(dealt * 8000 / maxHp), regenerates 5 per game tick, breaks at 0)', () => {
  it('drains by the chip share of max HP and regenerates 5 per game tick only while not guarding', () => {
    const world = duel();
    const s = world.state;
    const g = now(s) + LATE;
    const chip = of(landAt(world, g, G), SimEventKind.guarded)[0]?.['chip'] ?? 0;
    const drain = Math.floor((chip * GUARD_DRAIN_PM) / (s.maxHp[0] ?? 1));
    expect(drain).toBeGreaterThan(0);
    expect(s.arcade[E(0, ArcadeE.guardDrain)]).toBe(drain);
    // Held guard (and block-stun): no regeneration; the frozen hit-stop ticks do not count either.
    until(world, g + 12, G);
    expect(s.arcade[E(0, ArcadeE.guardDrain)]).toBe(drain);
    step(world, [0, 0]);
    step(world, [0, 0]);
    expect(s.arcade[E(0, ArcadeE.guardDrain)]).toBe(Math.max(0, drain - 2 * GUARD_REGEN));
    until(world, now(s) + 400);
    expect(s.arcade[E(0, ArcadeE.guardDrain)]).toBe(0);
  });

  it('an emptied meter breaks the guard: `guardBroken` and 60 ticks of stun instead of block-stun', () => {
    const world = duel();
    const s = world.state;
    s.arcade[E(0, ArcadeE.guardDrain)] = GUARD_MAX - 1;
    const g = now(s) + LATE;
    const ev = landAt(world, g, G);
    expect(ev.map((e) => e.kind).filter((k) => k >= 40)).toEqual([
      SimEventKind.guarded, SimEventKind.hitStop, SimEventKind.guardBroken,
    ]);
    expect(of(ev, SimEventKind.guardBroken)[0]).toMatchObject({ target: 0 });
    expect(s.arcade[E(0, ArcadeE.guardDrain)]).toBe(GUARD_MAX);
    expect(s.arcade[E(0, ArcadeE.blockUntil)]).toBe(0);
    expect(s.arcade[E(0, ArcadeE.stunUntil)]).toBe(g + GUARD_BREAK_STUN_TICKS);
    // Stunned: the held guard does not guard, so the next hit is a confirmed combo hit.
    const next = landAt(world, g + 10, G);
    expect(of(next, SimEventKind.hitConfirmed)).toMatchObject([{ target: 0, combo: 1 }]);
  });

  it('drain one short of empty does not break', () => {
    const world = duel();
    const s = world.state;
    const chip = of(landAt(duel(), now(s) + LATE, G), SimEventKind.guarded)[0]?.['chip'] ?? 0;
    const drain = Math.floor((chip * GUARD_DRAIN_PM) / (s.maxHp[0] ?? 1));
    s.arcade[E(0, ArcadeE.guardDrain)] = GUARD_MAX - drain - 1;
    expect(of(landAt(world, now(s) + LATE, G), SimEventKind.guardBroken)).toEqual([]);
    expect(s.arcade[E(0, ArcadeE.guardDrain)]).toBe(GUARD_MAX - 1);
  });
});

describe('parry (rule: a guard press up to 8 ticks before a hit; no damage, 10 ticks of hit-stop, +150 meter)', () => {
  it('parries a hit landing 2..8 game ticks after the press, not 9 (edges 7, 8, 9)', () => {
    for (const k of [2, ...edges(PARRY_TICKS)]) {
      const world = duel();
      const s = world.state;
      const p = now(s) + 2;
      until(world, p);
      step(world, [G, 0]);
      const ev = landAt(world, p + k);
      expect([k, of(ev, SimEventKind.parried).length]).toEqual([k, k <= PARRY_TICKS ? 1 : 0]);
      // A whiff (guard released) is an ordinary hit.
      expect([k, of(ev, SimEventKind.hitConfirmed).length]).toEqual([k, k <= PARRY_TICKS ? 0 : 1]);
    }
  });

  it('a press on the hit tick parries it', () => {
    const world = duel();
    const g = now(world.state) + 2;
    until(world, g - 1);
    shoot(world);
    expect(of(step(world, [G, 0]), SimEventKind.parried)).toHaveLength(1);
  });

  it('reflects a projectile: no damage, parry hit-stop, +150 meter, and it flies back for the parrier', () => {
    const world = duel('sindarosa', 'sindarosa');
    const s = world.state;
    const hp = s.hp[0] ?? 0;
    const g = now(s) + 2;
    until(world, g - 1);
    const b = shoot(world);
    const vx = s.vx[b] ?? 0;
    expect(s.abil[countIdx(1, 0)]).toBe(1);
    const ev = step(world, [G, 0]);
    expect(ev.map((e) => e.kind)).toEqual([SimEventKind.parried, SimEventKind.hitStop]);
    expect(ev[0]).toMatchObject({ sourceId: b, target: 0, attacker: 1, reflected: 1 });
    expect(ev[1]).toMatchObject({ ticks: PARRY_HIT_STOP_TICKS, cause: HitStopCause.parry });
    expect(s.hp[0]).toBe(hp);
    expect(s.arcade[T(0, ArcadeT.meter)]).toBe(METER_PARRY);
    expect([s.team[b], s.owner[b], s.vx[b], s.dir[b]]).toEqual([0, 0, -vx, 0]);
    // The active count moves to the parrier (same race here): the shooter can fire it again, the parrier holds it.
    expect([s.abil[countIdx(1, 0)], s.abil[countIdx(0, 0)]]).toEqual([0, 1]);
    // The parry closes the window and clears the whiff lock.
    expect([s.arcade[E(0, ArcadeE.parryUntil)], s.arcade[E(0, ArcadeE.parryLockUntil)]]).toEqual([0, 0]);
    const back: SimEvent[] = [];
    for (let t = 0; t < 120 && s.flags[b] !== 0; t++) back.push(...step(world, [0, 0]));
    expect(of(back, SimEventKind.hitConfirmed)).toMatchObject([{ sourceId: b, target: 1, attacker: 0 }]);
    expect(s.abil[countIdx(0, 0)]).toBe(0);
  });

  it('a parried melee stuns its attacker for 20 game ticks', () => {
    const world = duel('pax', 'curomo');
    const s = world.state;
    s.x[1] = 380;
    const g = now(s) + 2;
    until(world, g);
    step(world, [G, Cmd.primary]); // Ice Shock is cast, and lands on the next tick
    const ev = step(world, [0, 0]);
    expect(of(ev, SimEventKind.parried)).toMatchObject([{ target: 0, attacker: 1, reflected: 0 }]);
    expect(of(ev, SimEventKind.damage)).toEqual([]);
    expect(s.arcade[E(1, ArcadeE.stunUntil)]).toBe(g + 1 + PARRY_STUN_TICKS);
    expect(s.arcade[E(0, ArcadeE.stunUntil)]).toBe(0);
  });

  it('supers are unblockable: neither guard nor a parry window stops them', () => {
    const world = duel('pax', 'sindarosa');
    const s = world.state;
    s.dir[1] = 4;
    s.arcade[T(1, ArcadeT.meter)] = METER_BAR;
    const ev: SimEvent[] = [...step(world, [G, Cmd.super])];
    for (let t = 0; t < 60; t++) ev.push(...step(world, [G, 0]));
    expect(of(ev, SimEventKind.hitConfirmed).length).toBeGreaterThan(0);
    expect(of(ev, SimEventKind.guarded)).toEqual([]);
    expect(of(ev, SimEventKind.parried)).toEqual([]);
  });

  it('a press while stunned opens the window on the first free tick, within the buffer only', () => {
    for (const k of edges(BUFFER_TICKS)) {
      const world = duel();
      const s = world.state;
      const g = now(s);
      s.arcade[E(0, ArcadeE.stunUntil)] = g + k;
      step(world, [G, 0]);
      until(world, g + k + 1);
      expect([k, s.arcade[E(0, ArcadeE.parryUntil)]]).toEqual([k, k <= BUFFER_TICKS ? g + k + PARRY_TICKS + 1 : 0]);
    }
  });
});

describe('whiff lock (rule: a parry window without a hit locks new parries for 20 ticks)', () => {
  it('a press 28 game ticks after a whiffed press is dropped; one at 29 parries (lock edges)', () => {
    const lockEnd = PARRY_TICKS + 1 + PARRY_LOCK_TICKS;
    for (const k of edges(lockEnd)) {
      const world = duel();
      const s = world.state;
      const p = now(s) + 2;
      until(world, p);
      step(world, [G, 0]);
      until(world, p + k);
      step(world, [G, 0]);
      const ev = landAt(world, p + k + 2);
      expect([k, of(ev, SimEventKind.parried).length]).toEqual([k, k >= lockEnd ? 1 : 0]);
    }
  });

  it('mashing inside the window does not extend it', () => {
    const world = duel();
    const p = now(world.state) + 2;
    until(world, p);
    step(world, [G, 0]);
    until(world, p + 5);
    step(world, [G, 0]);
    expect(of(landAt(world, p + PARRY_TICKS + 2), SimEventKind.parried)).toEqual([]);
  });

  it('a successful parry clears the lock: the next press parries again', () => {
    const world = duel();
    const p = now(world.state) + 2;
    until(world, p);
    step(world, [G, 0]);
    expect(of(landAt(world, p + 2), SimEventKind.parried)).toHaveLength(1);
    const q = now(world.state) + 1;
    until(world, q);
    step(world, [G, 0]);
    expect(of(landAt(world, q + 3), SimEventKind.parried)).toHaveLength(1);
  });
});

describe('dash out of guard', () => {
  it('a dash press while guarding starts the dash; block-stun holds it until it ends', () => {
    const world = duel();
    expect(of(step(world, [G | Cmd.dash | Cmd.right, 0]), SimEventKind.dashed)).toHaveLength(1);
    const other = duel();
    const g = now(other.state) + LATE;
    landAt(other, g, G);
    const ticks: number[] = [];
    for (let t = 0; t < 30; t++) {
      const at = now(other.state);
      if (of(step(other, [t === 0 ? G | Cmd.dash : G, 0]), SimEventKind.dashed).length > 0) ticks.push(at);
    }
    expect(ticks).toEqual([g + BLOCK_STUN_TICKS]);
  });
});

describe('Classic', () => {
  it('ignores the guard bit', () => {
    const a = duel('pax', 'sindarosa', false);
    const b = duel('pax', 'sindarosa', false);
    for (const c of [G, G | Cmd.right, Cmd.right, G | Cmd.primary, 0, G]) {
      const kinds = step(a, [c, c | Cmd.primary]).map((e) => e.kind);
      step(b, [c & ~G, (c | Cmd.primary) & ~G]);
      expect(hash(a.state)).toBe(hash(b.state));
      expect(kinds.some((k) => k >= 40)).toBe(false);
    }
  });
});

describe('guard properties', () => {
  const race = fc.constantFrom(...CHARACTERS.filter((c) => c.id !== 'eternal-void').map((c) => c.id));
  /** Guard taps and holds are frequent, so guards, breaks, parries and whiffs all happen. */
  const cmd = fc.tuple(fc.integer({ min: 0, max: 0x3f }), fc.boolean()).map(([c, g]) => c | (g ? G : 0));
  const runs = fc
    .array(fc.tuple(fc.integer({ min: 1, max: 24 }), cmd, cmd), { minLength: 1, maxLength: 40 })
    .map((rs) => rs.flatMap(([k, p, q]) => Array.from({ length: k }, (): [number, number] => [p, q])));

  it('guard and parry obey the rules, and re-simulate to identical hashes, also after a snapshot restore', () => {
    let guarded = 0;
    let parried = 0;
    fc.assert(
      fc.property(race, race, runs, fc.nat(), fc.boolean(), (a, rival, raw, cut, turret) => {
        // A turret run: team 1 is a Sindarosa 300 px away that only fires along team 0's row.
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
        const edge = [-99, -99];
        const prev = [0, 0];
        const hashes: number[] = [];
        for (const [p, q] of inputs) {
          const g = now(s);
          [p, q].forEach((c, team) => {
            if ((c & ~(prev[team] ?? 0) & G) !== 0) edge[team] = g;
            prev[team] = c;
          });
          const evs = step(world, [p, q]);
          hashes.push(hash(s));
          for (const id of [0, 1]) {
            const d = s.arcade[E(id, ArcadeE.guardDrain)] ?? 0;
            expect(d >= 0 && d <= GUARD_MAX).toBe(true);
          }
          for (const e of evs) {
            const target = e['target'] ?? -1;
            const team = s.team[target] ?? 0;
            if (e.kind === SimEventKind.guarded) {
              guarded++;
              const dmg = evs.find((d) => d.kind === SimEventKind.damage && d.sourceId === e.sourceId && d['target'] === target);
              expect(dmg?.['amount']).toBe(e['chip']);
            } else if (e.kind === SimEventKind.parried) {
              parried++;
              // A guard press (possibly buffered) opened the window: at most BUFFER_TICKS + PARRY_TICKS ago.
              expect(g - (edge[team] ?? -99)).toBeLessThanOrEqual(BUFFER_TICKS + PARRY_TICKS);
              expect(evs.some((d) => d.kind === SimEventKind.damage && d.sourceId === e.sourceId)).toBe(false);
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
      { numRuns: 100, seed: 0x6a4d },
    );
    expect(guarded).toBeGreaterThan(15);
    expect(parried).toBeGreaterThan(4);
  });
});
