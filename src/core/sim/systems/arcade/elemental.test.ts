import { describe, expect, it } from 'vitest';
import {
  ELEMENTAL_ARMOR_PM, ELEMENTAL_COOLDOWN_TICKS, ELEMENTAL_DAMAGE_PM, ELEMENTAL_NAMES, ELEMENTAL_SPEED_PM, ELEMENTAL_TICKS,
  SnagEvent,
} from '../../../data/arcade';
import { characterId } from '../../../data/ids';
import { DEFAULT_SIM_FLAGS } from '../../../flags';
import { now } from '../../clock';
import { Cmd, type Command } from '../../commands';
import { SimEventKind, type SimEvent } from '../../events';
import { hash } from '../../hash';
import { createMatch, type MatchSetup } from '../../match';
import { createSnapshotBuf, restore, snapshot } from '../../snapshot';
import { ARCADE_E, ArcadeE } from '../../state';
import { step } from '../../step';
import type { SimWorld } from '../../world';
import { hasSlow, onProjectileHit } from '../debuffs';
import { applyTimedStatus, StatusId } from '../status';
import { elementalDamagePm, elementalOn, elementalSpeedPm } from './elemental-buff';
import { skipIntro } from './round-testkit';

const E = (id: number, f: number): number => id * ARCADE_E + f;

/** `p1` (id 0, and `p1b` as id 2 when given) at (300, 300) against `p2` (id 1) at `foeX` on the same row. */
function duel(p1: string, p2 = 'pax', foeX = 450, arcade = true, p1b?: string): SimWorld {
  const setup: MatchSetup = {
    simVersion: 39, seed: 9, flags: { ...DEFAULT_SIM_FLAGS, rulesetArcade: arcade }, chapter: 1, difficulty: 1,
    p1: [{ character: characterId(p1), xp: 1 }, ...(p1b === undefined ? [] : [{ character: characterId(p1b), xp: 1 }])],
    p2: [{ character: characterId(p2), xp: 1 }],
  };
  const world = arcade ? skipIntro(createMatch(setup)) : createMatch(setup);
  const s = world.state;
  s.x[0] = 300; s.y[0] = 300; s.dir[0] = 0;
  s.x[1] = foeX; s.y[1] = 300; s.dir[1] = 4;
  return world;
}

function run(world: SimWorld, n: number, cmds: readonly [Command, Command] = [0, 0]): SimEvent[] {
  let out: SimEvent[] = [];
  for (let i = 0; i < n; i++) out = out.concat(step(world, cmds));
  return out;
}

const of = (evs: readonly SimEvent[], kind: number): SimEvent[] => evs.filter((e) => e.kind === kind);
const casts = (evs: readonly SimEvent[]): SimEvent[] => of(evs, SimEventKind.elementalCast);
/** The first `damage` amount dealt by `attacker` within `n` ticks of `cmds`. */
function firstHit(world: SimWorld, attacker: number, n: number, cmds: readonly [Command, Command]): number {
  const d = of(run(world, n, cmds), SimEventKind.damage).find((e) => e.attacker === attacker);
  return d?.amount ?? 0;
}

describe('elemental ability data (FUN-DESIGN 2.24)', () => {
  it('has the design numbers: 5 s buffs, 35 s cooldown (water 25 s), none for void', () => {
    expect([ELEMENTAL_TICKS, ELEMENTAL_DAMAGE_PM, ELEMENTAL_ARMOR_PM, ELEMENTAL_SPEED_PM]).toEqual([250, 1250, 800, 1300]);
    expect(ELEMENTAL_COOLDOWN_TICKS).toEqual([0, 1750, 1250, 1750, 1750, 0]);
    expect(ELEMENTAL_NAMES).toEqual(['', 'Ember', 'Cleanse', 'Stoneskin', 'Gale', '']);
  });
});

describe('elemental ability effects', () => {
  it('Ember: a fire hero deals x1.25 for 250 game ticks', () => {
    const on = duel('sindarosa');
    const off = duel('sindarosa');
    expect(casts(step(on, [Cmd.elemental, 0]))).toMatchObject([{ sourceId: 0, element: 1, team: 0, cleared: 0 }]);
    step(off, [0, 0]);
    expect(elementalOn(on.state, 0)).toBe(true);
    expect(elementalDamagePm(on.state, 0, 1)).toBe(ELEMENTAL_DAMAGE_PM);
    const boosted = firstHit(on, 0, 60, [Cmd.primary, 0]);
    const plain = firstHit(off, 0, 60, [Cmd.primary, 0]);
    expect(plain).toBeGreaterThan(0);
    expect(boosted).toBeCloseTo((plain * ELEMENTAL_DAMAGE_PM) / 1000, 9);
  });

  it('Stoneskin: an earth hero takes x0.8 for 250 game ticks', () => {
    const on = duel('pax', 'sindarosa');
    const off = duel('pax', 'sindarosa');
    expect(casts(step(on, [Cmd.elemental, 0]))).toMatchObject([{ element: 3 }]);
    step(off, [0, 0]);
    expect(elementalDamagePm(on.state, 1, 0)).toBe(ELEMENTAL_ARMOR_PM);
    expect(elementalDamagePm(on.state, 0, 1)).toBe(1000); // an earth attacker gains nothing
    const armoured = firstHit(on, 1, 60, [0, Cmd.primary]);
    const plain = firstHit(off, 1, 60, [0, Cmd.primary]);
    expect(plain).toBeGreaterThan(0);
    expect(armoured).toBeCloseTo((plain * ELEMENTAL_ARMOR_PM) / 1000, 9);
  });

  it('Gale: an air hero walks x1.3 from the cast tick', () => {
    const on = duel('cyclonius');
    const off = duel('cyclonius');
    step(on, [Cmd.elemental | Cmd.left, 0]);
    step(off, [Cmd.left, 0]);
    expect(elementalSpeedPm(on.state, 0)).toBe(ELEMENTAL_SPEED_PM);
    expect(300 - (on.state.x[0] ?? 0)).toBeCloseTo(((300 - (off.state.x[0] ?? 0)) * ELEMENTAL_SPEED_PM) / 1000, 9);
    expect(elementalSpeedPm(on.state, 1)).toBe(1000);
  });

  it('Cleanse: a water hero ends its root, Puddle slow, Ice Blast and tidal slow at once', () => {
    const world = duel('morblass', 'sindarosa');
    const s = world.state;
    const g = now(s);
    s.arcade[E(0, ArcadeE.rootUntil)] = g + 60;
    s.arcade[E(0, ArcadeE.trapSlowUntil)] = g + 60;
    onProjectileHit(world, 'ice-blast', 0, 1);
    applyTimedStatus(world, 0, StatusId.superSlow, 1, 200, -1.5);
    expect(hasSlow(s.status, 0)).toBe(true);
    const evs = step(world, [Cmd.elemental, 0]);
    expect(casts(evs)).toMatchObject([{ sourceId: 0, element: 2, cleared: 4 }]);
    expect(of(evs, SimEventKind.snag)).toMatchObject([{ id: 0, reason: SnagEvent.freed }]);
    expect(s.arcade[E(0, ArcadeE.rootUntil)]).toBe(0);
    expect(s.arcade[E(0, ArcadeE.trapSlowUntil)]).toBe(0);
    expect(hasSlow(s.status, 0)).toBe(false);
    expect(s.speed[0]).toBeCloseTo(s.baseSpeed[0] ?? 0, 9);
    expect(s.arcade[E(0, ArcadeE.elemUntil)]).toBe(0); // instant: no timed buff
    expect(s.arcade[E(0, ArcadeE.elemReadyAt)]).toBe(g + (ELEMENTAL_COOLDOWN_TICKS[2] ?? 0));
  });

  it('Cleanse with nothing to clear still spends the cooldown (cleared 0)', () => {
    const world = duel('curomo');
    expect(casts(step(world, [Cmd.elemental, 0]))).toMatchObject([{ element: 2, cleared: 0 }]);
  });
});

describe('elemental ability rules', () => {
  it('books the cooldown, refuses a press until it is over, and a held bit casts once', () => {
    const world = duel('sindarosa');
    const s = world.state;
    const g = now(s);
    expect(casts(run(world, 30, [Cmd.elemental, 0]))).toHaveLength(1);
    expect(s.arcade[E(0, ArcadeE.elemReadyAt)]).toBe(g + 1750);
    step(world, [0, 0]);
    expect(casts(step(world, [Cmd.elemental, 0]))).toEqual([]);
    while (now(s) < g + 1750) step(world, [0, 0]);
    expect(casts(step(world, [Cmd.elemental, 0]))).toHaveLength(1);
  });

  it('the buff ends once with elementalEnded on its last game tick', () => {
    const world = duel('cyclonius');
    const s = world.state;
    const g = now(s);
    step(world, [Cmd.elemental, 0]);
    const ends: number[] = [];
    while (now(s) < g + ELEMENTAL_TICKS + 20) {
      for (const e of of(step(world, [0, 0]), SimEventKind.elementalEnded)) ends.push(now(s) - 1, Number(e.element));
    }
    expect(ends).toEqual([g + ELEMENTAL_TICKS, 4]);
    expect(elementalOn(s, 0)).toBe(false);
    expect(s.arcade[E(0, ArcadeE.elemUntil)]).toBe(0);
  });

  it('is refused outside the fight, for a void hero and while stunned; a buffered press fires when free', () => {
    const intro = createMatch({
      simVersion: 39, seed: 9, flags: { ...DEFAULT_SIM_FLAGS, rulesetArcade: true }, chapter: 1, difficulty: 1,
      p1: [{ character: characterId('fiara'), xp: 1 }], p2: [{ character: characterId('pax'), xp: 1 }],
    });
    expect(casts(step(intro, [Cmd.elemental, 0]))).toEqual([]);
    expect(casts(run(duel('dummy'), 5, [Cmd.elemental, 0]))).toEqual([]);
    const world = duel('fiara');
    const s = world.state;
    s.arcade[E(0, ArcadeE.stunUntil)] = now(s) + 4;
    expect(casts(step(world, [Cmd.elemental, 0]))).toEqual([]);
    expect(casts(run(world, 8))).toMatchObject([{ sourceId: 0, element: 1 }]);
  });

  it('bit 10 never swaps in a 2-hero tag team', () => {
    const world = duel('fiara', 'pax', 450, true, 'pax');
    const evs = run(world, 5, [Cmd.elemental, 0]);
    expect(of(evs, SimEventKind.swapped)).toEqual([]);
    expect(casts(evs)).toHaveLength(1);
  });

  it('does nothing in Classic', () => {
    const world = duel('fiara', 'pax', 450, false);
    expect(world.state.arcade.length).toBe(0);
    expect(casts(run(world, 5, [Cmd.elemental, 0]))).toEqual([]);
    expect(elementalDamagePm(world.state, 0, 1)).toBe(1000);
    expect(elementalSpeedPm(world.state, 0)).toBe(1000);
  });
});

describe('elemental ability snapshot', () => {
  it('a snapshot taken mid-buff restores to the same hash and the same expiry', () => {
    const world = duel('pax', 'sindarosa');
    step(world, [Cmd.elemental, 0]);
    run(world, 10, [0, Cmd.primary]);
    const buf = createSnapshotBuf(world.state);
    snapshot(world.state, buf);
    const other = duel('pax', 'sindarosa');
    restore(other.state, buf);
    expect(hash(other.state)).toBe(hash(world.state));
    // Idle: hit-stop would hold the game clock and push the expiry past the window.
    const a = of(run(world, ELEMENTAL_TICKS), SimEventKind.elementalEnded);
    const b = of(run(other, ELEMENTAL_TICKS), SimEventKind.elementalEnded);
    expect(a).toHaveLength(1);
    expect(b).toEqual(a);
    expect(hash(other.state)).toBe(hash(world.state));
  });

  it('the buff and the cooldown change the hash', () => {
    const a = duel('pax');
    const b = duel('pax');
    b.state.arcade[E(0, ArcadeE.elemUntil)] = 1;
    expect(hash(b.state)).not.toBe(hash(a.state));
    const c = duel('pax');
    c.state.arcade[E(0, ArcadeE.elemReadyAt)] = 1;
    expect(hash(c.state)).not.toBe(hash(a.state));
  });
});
