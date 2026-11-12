import { describe, expect, it } from 'vitest';
import {
  ARCADE_SNAG_SLOT, SNAG_ABILITY, SNAG_COOLDOWN_TICKS, SNAG_FIRE_ABILITIES, SNAG_IMMUNE_TICKS, SNAG_RANGE_PX,
  SNAG_ROOT_TICKS, SNAG_WIDTH_PX, SnagEvent, Weather, WEATHER_CHARGE_FULL,
} from '../../../data/arcade';
import { ABILITIES_A } from '../../../data/abilities-a';
import { ABILITIES_B } from '../../../data/abilities-b';
import { CHARACTERS } from '../../../data/characters';
import { characterId } from '../../../data/ids';
import { DEFAULT_SIM_FLAGS } from '../../../flags';
import { cooldownTicksFor } from '../../arcade-numbers';
import { now } from '../../clock';
import { Cmd, type Command } from '../../commands';
import { SimEventKind, type SimEvent } from '../../events';
import { hash } from '../../hash';
import { createMatch, type MatchSetup } from '../../match';
import { createSnapshotBuf, restore, snapshot } from '../../snapshot';
import { ARCADE_E, ARCADE_T, ARCADE_TEAM_BASE, ArcadeE, ArcadeT, cooldownIdx } from '../../state';
import { step } from '../../step';
import type { SimWorld } from '../../world';
import { slotAbility } from '../ability-info';
import { skipIntro } from './round-testkit';
import { isRooted } from './snag';

const E = (id: number, f: number): number => id * ARCADE_E + f;
const SLOT_CMD = [Cmd.primary, Cmd.secondary] as const;

/** `p1` (id 0) at (300, 300) facing east against `p2` (id 1) at `foeX` on the same row. */
function duel(p1 = 'treenoc', p2 = 'pax', foeX = 450, arcade = true): SimWorld {
  const setup: MatchSetup = {
    simVersion: 26, seed: 9, flags: { ...DEFAULT_SIM_FLAGS, rulesetArcade: arcade }, chapter: 1, difficulty: 1,
    p1: [{ character: characterId(p1), xp: 1 }],
    p2: [{ character: characterId(p2), xp: 1 }],
  };
  const world = arcade ? skipIntro(createMatch(setup)) : createMatch(setup);
  const s = world.state;
  s.x[0] = 300; s.y[0] = 300; s.dir[0] = 0;
  s.x[1] = foeX; s.y[1] = 300; s.dir[1] = 4;
  return world;
}

const snags = (evs: readonly SimEvent[]): SimEvent[] => evs.filter((e) => e.kind === SimEventKind.snag);

/** Steps `n` ticks with `cmds`, returning every event. */
function run(world: SimWorld, n: number, cmds: readonly [Command, Command] = [0, 0]): SimEvent[] {
  let out: SimEvent[] = [];
  for (let i = 0; i < n; i++) out = out.concat(step(world, cmds));
  return out;
}

/** Throws p1's Snag (slot `slot`) and steps until it lands or 20 ticks pass; returns the snag events. */
function throwSnag(world: SimWorld, slot = 0, foeCmd: Command = 0): SimEvent[] {
  let evs = step(world, [SLOT_CMD[slot] ?? 0, foeCmd]);
  for (let i = 0; i < 20 && snags(evs).length === 0; i++) evs = evs.concat(step(world, [0, foeCmd]));
  return snags(evs);
}

describe('Snag data (FUN-DESIGN 2.20)', () => {
  it('has the design numbers and slots', () => {
    expect([SNAG_RANGE_PX, SNAG_WIDTH_PX, SNAG_COOLDOWN_TICKS, SNAG_ROOT_TICKS, SNAG_IMMUNE_TICKS]).toEqual([240, 40, 400, 60, 75]);
    expect(ARCADE_SNAG_SLOT).toEqual({ treenoc: 0, wispera: 0, curomo: 1, echo: 0 });
    expect(SNAG_ABILITY).toBe('entangling-vines');
    const ids = [...ABILITIES_A, ...ABILITIES_B].map((d) => d.id);
    for (const a of SNAG_FIRE_ABILITIES) expect(ids).toContain(a);
  });

  it('replaces the right Classic ability on each hero, Arcade only', () => {
    const replaced = { treenoc: 'entangling-vines', wispera: 'sonar-blast', curomo: 'shards-of-ice', echo: 'fade' };
    for (const [hero, ability] of Object.entries(replaced)) {
      const slot = ARCADE_SNAG_SLOT[hero] ?? -1;
      expect(CHARACTERS.find((c) => c.id === hero)?.abilities[slot]).toBe(ability);
      expect(slotAbility(duel(hero).state, 0, slot)).toBe(SNAG_ABILITY);
      expect(slotAbility(duel(hero, 'pax', 450, false).state, 0, slot)).toBe(ability);
    }
    expect(slotAbility(duel('pax').state, 0, 0)).toBe(CHARACTERS.find((c) => c.id === 'pax')?.abilities[0]);
  });
});

describe('Snag root', () => {
  it('roots for exactly SNAG_ROOT_TICKS, then gives SNAG_IMMUNE_TICKS of immunity', () => {
    const world = duel();
    const s = world.state;
    expect(throwSnag(world)).toMatchObject([{ id: 1, reason: SnagEvent.rooted }]);
    const g = now(s) - 1; // the game tick the throw landed on
    expect(s.arcade[E(1, ArcadeE.rootUntil)]).toBe(g + SNAG_ROOT_TICKS);
    expect(isRooted(s, 1)).toBe(true);
    // Pax holds left: it cannot walk while rooted, but it turns and aims.
    const x = s.x[1];
    expect(snags(run(world, SNAG_ROOT_TICKS - 1, [0, Cmd.left]))).toEqual([]);
    expect(s.x[1]).toBe(x);
    expect(s.arcade[E(1, ArcadeE.aim)]).toBe(5); // dir8 4 (west) + 1
    // The root covers game ticks g .. g + 59; the 60th step after the landing runs on g + 60 and ends it.
    expect(snags(step(world, [0, Cmd.left]))).toMatchObject([{ id: 1, reason: SnagEvent.expired }]);
    expect(now(s)).toBe(g + SNAG_ROOT_TICKS + 1); // the expiry ran on game tick g + 60
    expect(s.arcade[E(1, ArcadeE.rootUntil)]).toBe(0);
    expect(s.arcade[E(1, ArcadeE.rootImmuneUntil)]).toBe(g + SNAG_ROOT_TICKS + SNAG_IMMUNE_TICKS);
    run(world, 1, [0, Cmd.left]);
    expect(s.x[1]).toBeLessThan(x ?? 0); // walks again
  });

  it('books the 400-tick Snag cooldown (+1, as legacy) and cannot refresh or chain a root', () => {
    const world = duel();
    const s = world.state;
    const g0 = now(s);
    throwSnag(world);
    expect(s.abil[cooldownIdx(0, 0)]).toBe(g0 + SNAG_COOLDOWN_TICKS + 1);
    const vines = [...ABILITIES_A, ...ABILITIES_B].find((d) => d.id === SNAG_ABILITY);
    expect(vines && cooldownTicksFor(vines, false)).toBe(250); // Classic keeps its 5 s
    // A rooted target ignores a second throw (no refresh), and so does an immune one (no chain).
    const until = s.arcade[E(1, ArcadeE.rootUntil)];
    s.abil[cooldownIdx(0, 0)] = 0;
    expect(throwSnag(world)).toEqual([]);
    expect(s.arcade[E(1, ArcadeE.rootUntil)]).toBe(until);
    run(world, SNAG_ROOT_TICKS);
    expect(isRooted(s, 1)).toBe(false);
    s.abil[cooldownIdx(0, 0)] = 0;
    expect(throwSnag(world)).toEqual([]);
    expect(isRooted(s, 1)).toBe(false);
  });

  it('misses a foe out of range', () => {
    const world = duel('treenoc', 'pax', 300 + (world0W() + SNAG_RANGE_PX + 10));
    expect(throwSnag(world)).toEqual([]);
    expect(isRooted(world.state, 1)).toBe(false);
  });

  it('blocks starting a Dash or a Charge; a rooted hero can still cast', () => {
    const world = duel('treenoc', 'pax', 450);
    const s = world.state;
    throwSnag(world);
    expect(isRooted(s, 1)).toBe(true);
    const evs = run(world, 4, [0, Cmd.dash | Cmd.left]).concat(run(world, 2, [0, Cmd.charge]));
    expect(evs.filter((e) => e.kind === SimEventKind.dashed || e.kind === SimEventKind.chargeStarted)).toEqual([]);
    expect(s.arcade[E(1, ArcadeE.chargeUntil)] ?? 0).toBe(0);
    // Control: unrooted, the same presses start them.
    const kinds = (w: SimWorld, c: Command): number[] => run(w, 2, [0, c]).map((e) => e.kind);
    expect(kinds(duel('treenoc', 'pax', 450), Cmd.dash | Cmd.left)).toContain(SimEventKind.dashed);
    expect(kinds(duel('treenoc', 'pax', 900), Cmd.charge)).toContain(SimEventKind.chargeStarted);
    const cd = s.abil[cooldownIdx(1, 0)] ?? 0;
    run(world, 3, [0, Cmd.primary]);
    expect(s.abil[cooldownIdx(1, 0)]).toBeGreaterThan(cd); // Adrenaline cast
  });
});

function world0W(): number {
  return duel().state.w[0] ?? 0;
}

describe('Snag counters', () => {
  it('guard wastes the throw: `snag` guarded, no root, the cooldown still spent', () => {
    const world = duel();
    const s = world.state;
    step(world, [0, Cmd.guard]);
    const g0 = now(s);
    expect(throwSnag(world, 0, Cmd.guard)).toMatchObject([{ id: 1, reason: SnagEvent.guarded }]);
    expect(isRooted(s, 1)).toBe(false);
    expect(s.arcade[E(1, ArcadeE.rootImmuneUntil)] ?? 0).toBe(0);
    expect(s.abil[cooldownIdx(0, 0)]).toBe(g0 + SNAG_COOLDOWN_TICKS + 1);
  });

  it('a fire shot frees the rooted target at once and still deals its damage', () => {
    // Pax (team 0) rooted by hand; Fiara's Fireball (team 1) burns the rope.
    const world = duel('pax', 'fiara', 600);
    const s = world.state;
    s.arcade[E(0, ArcadeE.rootUntil)] = now(s) + SNAG_ROOT_TICKS;
    const hp = s.hp[0] ?? 0;
    const evs = run(world, 40, [0, Cmd.secondary]);
    const freed = snags(evs);
    expect(freed).toMatchObject([{ id: 0, reason: SnagEvent.freed }]);
    expect(s.hp[0]).toBeLessThan(hp);
    expect(isRooted(s, 0)).toBe(false);
    const t = freed[0]?.tick ?? 0;
    expect(s.arcade[E(0, ArcadeE.rootImmuneUntil)]).toBeGreaterThan(t);
  });

  it('a non-fire shot does not free it', () => {
    const world = duel('pax', 'rokcore', 600);
    const s = world.state;
    s.arcade[E(0, ArcadeE.rootUntil)] = now(s) + 1000;
    expect(snags(run(world, 40, [0, Cmd.secondary]))).toEqual([]); // Rock Pellet
    expect(isRooted(s, 0)).toBe(true);
  });

  it('a Sun cast frees every rooted fighter', () => {
    const world = duel('treenoc', 'fiara');
    const s = world.state;
    throwSnag(world);
    expect(isRooted(s, 1)).toBe(true);
    s.arcade[ARCADE_TEAM_BASE + 1 * ARCADE_T + ArcadeT.weatherCharge] = WEATHER_CHARGE_FULL;
    const evs = run(world, 2, [0, Cmd.weather]);
    expect(evs.find((e) => e.kind === SimEventKind.weatherChanged)).toMatchObject({ weather: Weather.sun });
    expect(snags(evs)).toMatchObject([{ id: 1, reason: SnagEvent.freed }]);
    expect(isRooted(s, 1)).toBe(false);
  });
});

describe('Snag per hero (Arcade probe)', () => {
  for (const [hero, slot] of Object.entries(ARCADE_SNAG_SLOT)) {
    it(`${hero} roots with slot ${String(slot)}`, () => {
      const world = duel(hero);
      expect(throwSnag(world, slot)).toMatchObject([{ id: 1, reason: SnagEvent.rooted }]);
    });
  }

  it('aims along the 8-way aim: a foe straight below is rooted after aiming down', () => {
    const world = duel();
    const s = world.state;
    s.x[1] = 300; s.y[1] = 300 + (s.h[0] ?? 0) + 100;
    step(world, [Cmd.down, 0]);
    s.y[0] = 300;
    expect(throwSnag(world)).toMatchObject([{ id: 1, reason: SnagEvent.rooted }]);
  });
});

describe('Snag stays out of Classic', () => {
  it('Classic Treenoc keeps the Entangling Vines freeze: no snag event, no Arcade state', () => {
    const world = duel('treenoc', 'pax', 450, false);
    expect(world.state.arcade.length).toBe(0);
    const evs = run(world, 30, [Cmd.primary, 0]);
    expect(snags(evs)).toEqual([]);
    expect(isRooted(world.state, 1)).toBe(false);
  });
});

describe('Snag snapshot', () => {
  it('a snapshot taken mid-root restores to the same hash and the same expiry', () => {
    const world = duel();
    throwSnag(world);
    run(world, 10);
    const buf = createSnapshotBuf(world.state);
    snapshot(world.state, buf);
    const h = hash(world.state);
    const other = duel();
    restore(other.state, buf);
    expect(hash(other.state)).toBe(h);
    expect(other.state.arcade[E(1, ArcadeE.rootUntil)]).toBe(world.state.arcade[E(1, ArcadeE.rootUntil)]);
    const a = snags(run(world, SNAG_ROOT_TICKS));
    const b = snags(run(other, SNAG_ROOT_TICKS));
    expect(b).toEqual(a);
    expect(hash(other.state)).toBe(hash(world.state));
  });

  it('the root changes the hash', () => {
    const a = duel();
    const b = duel();
    b.state.arcade[E(1, ArcadeE.rootUntil)] = 1;
    expect(hash(b.state)).not.toBe(hash(a.state));
  });
});
