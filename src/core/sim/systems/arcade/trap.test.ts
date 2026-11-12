import { describe, expect, it } from 'vitest';
import {
  RoundPhase, TRAP_ARM_TICKS, TRAP_BLAST_PX, TRAP_BOX_PX, TRAP_CAST_TICKS, TRAP_COOLDOWN_TICKS, TRAP_LIFE_TICKS,
  TRAP_MIN_GAP_PX, TRAP_PLACE_PX, TRAP_PUDDLE_LINGER_TICKS, TRAP_PUDDLE_SLOW_PM, TRAP_TEAM_MAX, TRAP_TRIGGER_PX, TrapKind,
  TrapReason,
} from '../../../data/arcade';
import { characterId } from '../../../data/ids';
import { DEFAULT_SIM_FLAGS } from '../../../flags';
import { now } from '../../clock';
import { Cmd, type Command } from '../../commands';
import { SimEventKind, type SimEvent } from '../../events';
import { hash } from '../../hash';
import { createMatch, type MatchSetup } from '../../match';
import { createSnapshotBuf, restore, snapshot } from '../../snapshot';
import { ARCADE_E, ARCADE_WORLD_BASE, ArcadeE, ArcadeW, TRAP_STRIDE, TRAP_TABLE, TrapF, World as W } from '../../state';
import { step } from '../../step';
import type { SimWorld } from '../../world';
import { skipIntro } from './round-testkit';
import { inTrapRecovery, isStunned, trapSlowPm } from './stun';
import { trapCount, trapKindOf } from './trap';

const E = (id: number, f: number): number => id * ARCADE_E + f;
const AW = (f: number): number => ARCADE_WORLD_BASE + f;
const T = (slot: number, f: number): number => ARCADE_WORLD_BASE + TRAP_TABLE + slot * TRAP_STRIDE + f;

/** `p1` (id 0) at (300, 300) facing east against `p2` (id 1) at `foeX`, on a stage with no element and no patches. */
function duel(p1 = 'fiara', p2 = 'pax', foeX = 900, arcade = true): SimWorld {
  const setup: MatchSetup = {
    simVersion: 33, seed: 9, flags: { ...DEFAULT_SIM_FLAGS, rulesetArcade: arcade }, chapter: 1, difficulty: 1,
    p1: [{ character: characterId(p1), xp: 1 }],
    p2: [{ character: characterId(p2), xp: 1 }],
  };
  const world = arcade ? skipIntro(createMatch(setup)) : createMatch(setup);
  const s = world.state;
  if (arcade) {
    s.arcade[AW(ArcadeW.stage)] = 0;
    s.arcade[AW(ArcadeW.patchCount)] = 0;
  }
  s.x[0] = 300; s.y[0] = 300; s.dir[0] = 0;
  s.x[1] = foeX; s.y[1] = 300; s.dir[1] = 4;
  return world;
}

const of = (evs: readonly SimEvent[], kind: number): SimEvent[] => evs.filter((e) => e.kind === kind);

function run(world: SimWorld, n: number, cmds: readonly [Command, Command] = [0, 0]): SimEvent[] {
  let out: SimEvent[] = [];
  for (let i = 0; i < n; i++) out = out.concat(step(world, cmds));
  return out;
}

/** p1 plants (one press tick, then a release tick); returns the events. */
const plant = (world: SimWorld, foeCmd: Command = 0): SimEvent[] => run(world, 1, [Cmd.trap, foeCmd]).concat(run(world, 1, [0, foeCmd]));

/** Steps until the trap arms (the placing tick was the first of TRAP_ARM_TICKS); returns the events. */
const toArm = (world: SimWorld): SimEvent[] => run(world, TRAP_ARM_TICKS - 1);

describe('Trap data (WP 39)', () => {
  it('has the design numbers', () => {
    expect([TRAP_PLACE_PX, TRAP_CAST_TICKS, TRAP_ARM_TICKS, TRAP_BOX_PX, TRAP_TRIGGER_PX, TRAP_BLAST_PX]).toEqual([72, 14, 30, 56, 24, 112]);
    expect([...TRAP_LIFE_TICKS]).toEqual([0, 150, 300, 200, 200]);
    expect([TRAP_COOLDOWN_TICKS, TRAP_TEAM_MAX, TRAP_MIN_GAP_PX, TRAP_PUDDLE_SLOW_PM, TRAP_PUDDLE_LINGER_TICKS]).toEqual([500, 2, 64, 600, 40]);
  });

  it('plants the hero element, else the stage element, else a Fire Bomb', () => {
    const kinds = ['fiara', 'curomo', 'treenoc', 'cyclonius', 'pax'].map((h) => trapKindOf(duel(h).state, 0));
    expect(kinds).toEqual([TrapKind.fireBomb, TrapKind.puddle, TrapKind.spike, TrapKind.gust, TrapKind.spike]);
    const world = duel('dummy');
    expect(trapKindOf(world.state, 0)).toBe(TrapKind.fireBomb);
    world.state.arcade[AW(ArcadeW.stage)] = TrapKind.puddle;
    expect(trapKindOf(world.state, 0)).toBe(TrapKind.puddle);
  });
});

describe('Trap placement', () => {
  it('plants TRAP_PLACE_PX ahead of the centre along the aim, starts the cooldown and a walk lock', () => {
    const world = duel();
    const s = world.state;
    const g = now(s);
    const placed = of(run(world, 1, [Cmd.trap, 0]), SimEventKind.trapPlaced);
    expect(placed).toHaveLength(1);
    expect(placed[0]).toMatchObject({ slot: 0, trap: TrapKind.fireBomb, x: 340 + 72 - 28, y: 340 - 28, team: 0, sourceId: 0 });
    expect(s.arcade[T(0, TrapF.armAt)]).toBe(g + TRAP_ARM_TICKS);
    expect(s.arcade[T(0, TrapF.endAt)]).toBe(g + TRAP_ARM_TICKS + 150);
    expect(s.arcade[E(0, ArcadeE.trapReadyAt)]).toBe(g + TRAP_COOLDOWN_TICKS);
    expect(trapCount(s, 0)).toBe(1);
    expect(inTrapRecovery(s, 0)).toBe(true);
    const x0 = s.x[0];
    run(world, 5, [Cmd.left, 0]);
    expect(s.x[0]).toBe(x0);
    run(world, TRAP_CAST_TICKS, [Cmd.left, 0]);
    expect(inTrapRecovery(s, 0)).toBe(false);
    expect(s.x[0]).toBeLessThan(x0 ?? 0);
  });

  it('is clamped inside the arena (a held diagonal aims it into the corner)', () => {
    const world = duel();
    const s = world.state;
    const ar = world.arena;
    s.x[0] = ar.x + ar.w - 80;
    s.y[0] = ar.y + ar.h - 80;
    s.x[1] = 300;
    const placed = of(run(world, 1, [Cmd.trap | Cmd.right | Cmd.down, 0]), SimEventKind.trapPlaced);
    expect(placed[0]).toMatchObject({ x: ar.x + ar.w - TRAP_BOX_PX, y: ar.y + ar.h - TRAP_BOX_PX });
  });

  it('is refused on cooldown, near another trap and at the team cap, spending nothing', () => {
    const world = duel();
    const s = world.state;
    plant(world);
    expect(of(plant(world), SimEventKind.trapPlaced)).toHaveLength(0);
    s.arcade[E(0, ArcadeE.trapReadyAt)] = 0;
    expect(of(plant(world), SimEventKind.trapPlaced)).toHaveLength(0);
    expect(s.arcade[E(0, ArcadeE.trapReadyAt)]).toBe(0);
    s.x[0] = 600;
    expect(of(plant(world), SimEventKind.trapPlaced)).toHaveLength(1);
    s.arcade[E(0, ArcadeE.trapReadyAt)] = 0;
    s.x[0] = 1000; s.x[1] = 1500;
    expect(trapCount(s, 0)).toBe(TRAP_TEAM_MAX);
    expect(of(plant(world), SimEventKind.trapPlaced)).toHaveLength(0);
    expect(s.arcade[E(0, ArcadeE.trapReadyAt)]).toBe(0);
  });

  it('is refused while stunned, outside the fight and inside an earth rock', () => {
    const stunned = duel();
    stunned.state.arcade[E(0, ArcadeE.stunUntil)] = now(stunned.state) + 50;
    expect(of(plant(stunned), SimEventKind.trapPlaced)).toHaveLength(0);
    const intro = duel();
    intro.state.arcade[AW(ArcadeW.phase)] = RoundPhase.intro;
    intro.state.arcade[AW(ArcadeW.phaseUntil)] = 1000;
    expect(of(plant(intro), SimEventKind.trapPlaced)).toHaveLength(0);
    const rock = duel();
    const a = rock.state.arcade;
    a[AW(ArcadeW.stage)] = 3;
    a[AW(ArcadeW.patchCount)] = 1;
    a.set([380, 300, 40, 40], AW(ArcadeW.patches));
    expect(of(plant(rock), SimEventKind.trapPlaced)).toHaveLength(0);
    expect(a[E(0, ArcadeE.trapReadyAt)]).toBe(0);
  });

  it('leaves the press buffered: a plant refused by a short stun lands once the stun ends', () => {
    const world = duel();
    world.state.arcade[E(0, ArcadeE.stunUntil)] = now(world.state) + 3;
    const evs = run(world, 1, [Cmd.trap, 0]).concat(run(world, 6));
    expect(of(evs, SimEventKind.trapPlaced)).toHaveLength(1);
  });
});

describe('Trap fuse and triggers', () => {
  it('does nothing while arming, then fires on the foe inside its trigger box', () => {
    const world = duel('fiara', 'pax', 420);
    const s = world.state;
    const evs = run(world, 1, [Cmd.trap, 0]).concat(toArm(world));
    expect(of(evs, SimEventKind.trapTriggered)).toHaveLength(0);
    const hp = s.hp[1] ?? 0;
    const fire = step(world, [0, 0]);
    expect(of(fire, SimEventKind.trapArmed)).toHaveLength(1);
    expect(of(fire, SimEventKind.trapTriggered)[0]).toMatchObject({ reason: TrapReason.overlap, trap: TrapKind.fireBomb, slot: 0 });
    expect(s.hp[1]).toBeLessThan(hp);
    expect(trapCount(s, 0)).toBe(0);
  });

  it.each([
    ['fiara', TrapKind.fireBomb], ['curomo', TrapKind.puddle], ['treenoc', TrapKind.spike], ['cyclonius', TrapKind.gust],
  ] as const)('%s trap times out after arming + its life with no foe near', (hero, kind) => {
    const world = duel(hero);
    const hp = world.state.hp[1];
    const life = TRAP_ARM_TICKS + (TRAP_LIFE_TICKS[kind] ?? 0);
    const before = run(world, 1, [Cmd.trap, 0]).concat(run(world, life - 1));
    expect(of(before, SimEventKind.trapTriggered)).toHaveLength(0);
    const end = of(step(world, [0, 0]), SimEventKind.trapTriggered);
    expect(end[0]).toMatchObject({ trap: kind, reason: TrapReason.timeout });
    expect(trapCount(world.state, 0)).toBe(0);
    expect(world.state.hp[1]).toBe(hp);
  });

  it('a Spike hurts, stuns and adds a juggle point', () => {
    const world = duel('treenoc');
    const s = world.state;
    run(world, 1, [Cmd.trap, 0]);
    toArm(world);
    s.x[1] = 420;
    const hp = s.hp[1] ?? 0;
    expect(of(step(world, [0, 0]), SimEventKind.trapTriggered)[0]).toMatchObject({ trap: TrapKind.spike, reason: TrapReason.overlap });
    expect(s.hp[1]).toBeLessThan(hp);
    expect(isStunned(s, 1)).toBe(true);
    expect(s.arcade[E(1, ArcadeE.juggle)]).toBe(1);
  });

  it('a Gust shoves the foe away without damage', () => {
    const world = duel('cyclonius');
    const s = world.state;
    run(world, 1, [Cmd.trap, 0]);
    toArm(world);
    s.x[1] = 430;
    const hp = s.hp[1];
    expect(of(step(world, [0, 0]), SimEventKind.trapTriggered)[0]).toMatchObject({ trap: TrapKind.gust });
    run(world, 10);
    expect(s.hp[1]).toBe(hp);
    expect(s.x[1]).toBeGreaterThan(470);
  });

  it('a Puddle slows the foe while it stands in it and TRAP_PUDDLE_LINGER_TICKS after, and stays', () => {
    const world = duel('curomo');
    const s = world.state;
    run(world, 1, [Cmd.trap, 0]);
    toArm(world);
    expect(trapSlowPm(s, 1)).toBe(1000);
    s.x[1] = 420;
    const evs = run(world, 1);
    expect(of(evs, SimEventKind.trapTriggered)).toHaveLength(0);
    expect(trapCount(s, 0)).toBe(1);
    expect(trapSlowPm(s, 1)).toBe(TRAP_PUDDLE_SLOW_PM);
    expect(s.arcade[E(1, ArcadeE.trapSlowUntil)]).toBe(now(s) - 1 + TRAP_PUDDLE_LINGER_TICKS);
    const slowX = s.x[1];
    run(world, 10, [0, Cmd.right]);
    const slowStep = s.x[1] - slowX;
    s.x[1] = 900;
    const left = (s.arcade[E(1, ArcadeE.trapSlowUntil)] ?? 0) - now(s);
    expect(left).toBeGreaterThan(0);
    run(world, left - 1);
    expect(trapSlowPm(s, 1)).toBe(TRAP_PUDDLE_SLOW_PM);
    run(world, 1);
    expect(trapSlowPm(s, 1)).toBe(1000);
    const fastX = s.x[1];
    run(world, 10, [0, Cmd.right]);
    expect(s.x[1] - fastX).toBeGreaterThan(slowStep);
  });

  it('never fires on its own team or an invulnerable foe', () => {
    const world = duel();
    const s = world.state;
    run(world, 1, [Cmd.trap, 0]);
    s.x[0] = 384; s.y[0] = 300;
    s.x[1] = 420;
    s.arcade[E(1, ArcadeE.invulnUntil)] = now(s) + 100;
    expect(of(run(world, 60), SimEventKind.trapTriggered)).toHaveLength(0);
    s.arcade[E(1, ArcadeE.invulnUntil)] = 0;
    expect(of(run(world, 1), SimEventKind.trapTriggered)).toHaveLength(1);
  });

  it('a held guard blocks the Fire Bomb', () => {
    const world = duel('fiara', 'pax', 420);
    const evs = run(world, 1, [Cmd.trap, Cmd.guard]).concat(run(world, TRAP_ARM_TICKS, [0, Cmd.guard]));
    expect(of(evs, SimEventKind.trapTriggered)).toHaveLength(1);
    expect(of(evs, SimEventKind.guarded)).toHaveLength(1);
  });

  it('a parry on the bomb stuns its owner', () => {
    const world = duel('fiara', 'pax', 420);
    const s = world.state;
    run(world, 1, [Cmd.trap, 0]);
    run(world, TRAP_ARM_TICKS - 3);
    const evs = run(world, 3, [0, Cmd.guard]);
    expect(of(evs, SimEventKind.trapTriggered)).toHaveLength(1);
    expect(of(evs, SimEventKind.parried)).toHaveLength(1);
    expect(isStunned(s, 0)).toBe(true);
    expect(s.hp[1]).toBe(s.maxHp[1]);
  });

  it('the fuse stands still while the game clock is frozen', () => {
    const world = duel();
    const s = world.state;
    run(world, 1, [Cmd.trap, 0]);
    s.arcade[AW(ArcadeW.freezeUntil)] = (s.world[W.tick] ?? 0) + 100;
    expect(of(run(world, 100 + TRAP_ARM_TICKS - 1), SimEventKind.trapArmed)).toHaveLength(0);
    expect(of(run(world, 1), SimEventKind.trapArmed)).toHaveLength(1);
  });
});

describe('Trap douse and lifecycle', () => {
  it('a fire shot douses an enemy Puddle and flies on; it leaves a Fire Bomb alone', () => {
    const world = duel('fiara', 'curomo', 700);
    const s = world.state;
    run(world, 1, [0, Cmd.trap]);
    expect(trapCount(s, 1)).toBe(1);
    const evs = run(world, 1, [Cmd.secondary, 0]).concat(run(world, 60));
    expect(of(evs, SimEventKind.trapTriggered)[0]).toMatchObject({ trap: TrapKind.puddle, reason: TrapReason.doused, team: 1 });
    expect(trapCount(s, 1)).toBe(0);
    const bomb = duel('fiara', 'fiara', 700);
    run(bomb, 1, [0, Cmd.trap]);
    run(bomb, 1, [Cmd.secondary, 0]);
    expect(of(run(bomb, 20), SimEventKind.trapTriggered)).toHaveLength(0);
    expect(trapCount(bomb.state, 1)).toBe(1);
  });

  it('a Fire Bomb blast douses an enemy Gust in it', () => {
    const world = duel();
    const s = world.state;
    run(world, 1, [Cmd.trap, 0]);
    s.arcade.set([TrapKind.gust, 420, 312, 1, 0, 100000, 1], T(1, 0));
    s.x[1] = 1500;
    const evs = run(world, TRAP_ARM_TICKS + 150);
    const ends = of(evs, SimEventKind.trapTriggered);
    expect(ends.map((e) => [e['trap'], e['reason']])).toEqual([[TrapKind.fireBomb, TrapReason.timeout], [TrapKind.gust, TrapReason.doused]]);
  });

  it('a new round clears every trap with no event', () => {
    const world = duel();
    const s = world.state;
    run(world, 1, [Cmd.trap, 0]);
    s.arcade[AW(ArcadeW.phase)] = RoundPhase.roundEnd;
    s.arcade[AW(ArcadeW.phaseUntil)] = 0;
    const evs = run(world, 1);
    expect(of(evs, SimEventKind.roundStarted)).toHaveLength(1);
    expect(of(evs, SimEventKind.trapTriggered)).toHaveLength(0);
    expect(trapCount(s, 0)).toBe(0);
    expect(s.arcade[E(0, ArcadeE.trapReadyAt)]).toBe(0);
  });

  it('bit 6 stays capture in Classic: no trap, no Arcade state', () => {
    const world = duel('fiara', 'pax', 900, false);
    expect(of(run(world, 2, [Cmd.trap, 0]), SimEventKind.trapPlaced)).toHaveLength(0);
    expect(world.state.arcade).toHaveLength(0);
  });

  it('round-trips through a snapshot with the same hashes', () => {
    const world = duel('curomo', 'pax', 420);
    run(world, 1, [Cmd.trap, 0]);
    const buf = createSnapshotBuf(world.state);
    snapshot(world.state, buf);
    run(world, 40);
    const h = hash(world.state);
    restore(world.state, buf);
    run(world, 40);
    expect(hash(world.state)).toBe(h);
  });
});
