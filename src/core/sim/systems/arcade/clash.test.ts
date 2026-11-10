import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { CLASH_FLOOR_DIV, CLASH_LOSER_DIV, METER_BAR, METER_CLASH } from '../../../data/arcade';
import { CHARACTER_HEIGHT } from '../../../data/chapters';
import { ELEMENTS, elementRelation, type Element } from '../../../data/elements';
import { characterId } from '../../../data/ids';
import { DEFAULT_SIM_FLAGS } from '../../../flags';
import { allocEntity, isAlive } from '../../alloc';
import { now } from '../../clock';
import { Cmd } from '../../commands';
import { EventSink, SimEventKind, type SimEvent } from '../../events';
import { hash } from '../../hash';
import { createMatch, type MatchSetup } from '../../match';
import { createSnapshotBuf, restore, snapshot } from '../../snapshot';
import {
  ARCADE_E, ARCADE_T, ARCADE_TEAM_BASE, ARCADE_WORLD_BASE, ArcadeE, ArcadeT, ArcadeW, countIdx, EntityKind, World,
} from '../../state';
import { SYSTEMS, step } from '../../step';
import type { SimWorld } from '../../world';
import { abilitySlot } from '../ability-info';
import { ABILITY_DEFS } from '../projectile';
import { arcadeClashSystem, clashHp } from './clash';
import { skipIntro } from './round-testkit';

const K = SimEventKind;
const meter = (w: SimWorld, team: number): number => w.state.arcade[ARCADE_TEAM_BASE + team * ARCADE_T + ArcadeT.meter] ?? 0;
const of = (ev: readonly SimEvent[], kind: number): SimEvent[] => ev.filter((e) => e.kind === kind);
/** One race per element, each with a projectile in slot `shot`. */
const RACE: Readonly<Record<Element, readonly [race: string, shot: string]>> = {
  fire: ['sindarosa', 'fire-blast'], air: ['cyclonius', 'wind-cone'], earth: ['rokcore', 'rock-pellet'],
  water: ['morblass', 'icicles'], void: ['eternal-void', 'chaos-bolt'],
};
const defIdx = (slug: string): number => ABILITY_DEFS.findIndex((d) => d.id === slug);

/** `p1` (id 0) at (300, 300) facing east against `p2` (id 1) at (900, 300) facing west, straight into the fight. */
function duel(p1: string, p2: string, arcade = true): SimWorld {
  const setup: MatchSetup = {
    simVersion: 16, seed: 18, flags: { ...DEFAULT_SIM_FLAGS, rulesetArcade: arcade }, chapter: 1, difficulty: 1,
    p1: [{ character: characterId(p1), xp: 1 }],
    p2: [{ character: characterId(p2), xp: 1 }],
  };
  const world = skipIntro(createMatch(setup));
  const s = world.state;
  s.x[0] = 300; s.y[0] = 300; s.dir[0] = 0;
  s.x[1] = 900; s.y[1] = 300; s.dir[1] = 4;
  return world;
}

/**
 * A still 40 x 20 projectile of ability `slug` for `owner` at (x, y) with damage `hp` (default: the ability's), its
 * active count booked like a cast. Placed above the fighters (y 200) by default, so it hits nobody.
 */
function bullet(world: SimWorld, owner: number, slug: string, x: number, y = 200, hp?: number): number {
  const s = world.state;
  const id = allocEntity(s);
  const d = defIdx(slug);
  s.kind[id] = EntityKind.projectile;
  s.defId[id] = d;
  s.team[id] = s.team[owner] ?? 0;
  s.owner[id] = owner;
  s.x[id] = x; s.px[id] = x;
  s.y[id] = y; s.py[id] = y;
  s.w[id] = 40;
  s.h[id] = 20;
  s.hp[id] = hp ?? ABILITY_DEFS[d]?.damage ?? 0;
  const slot = abilitySlot(s, owner, d);
  if (slot >= 0) s.abil[countIdx(owner, slot)] = (s.abil[countIdx(owner, slot)] ?? 0) + 1;
  return id;
}

const count = (w: SimWorld, owner: number, slug: string): number =>
  w.state.abil[countIdx(owner, abilitySlot(w.state, owner, defIdx(slug)))] ?? 0;

describe('clash table (FUN-DESIGN 2.9)', () => {
  it('has the design numbers and the event kind', () => {
    expect([CLASH_LOSER_DIV, CLASH_FLOOR_DIV, METER_CLASH]).toEqual([2, 4, 50]);
    expect(K.clash).toBe(48);
  });

  it('runs in the collision slot', () => {
    expect(SYSTEMS.find(([name]) => name === 'collision')?.[1]).toBe(arcadeClashSystem);
  });

  it('clashHp: hp - loserHp / 2, never below a quarter of its own, exact', () => {
    expect(clashHp(40, 20)).toBe(30);
    expect(clashHp(40, 60)).toBe(10);
    expect(clashHp(40, 100)).toBe(10);
    expect(clashHp(10, 0)).toBe(10);
    expect(clashHp(0, 30)).toBe(0);
    // Power-of-two divisions: the floor is the exact quarter, also of a fractional (Fireball, Sonar) damage.
    expect(clashHp(0.1 * 3, 9)).toBe((0.1 * 3) / 4);
  });

  it('clashHp stays within [hp / 4, hp] (property)', () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 1e4, noNaN: true }), fc.double({ min: 0, max: 1e4, noNaN: true }), (hp, l) => {
        const r = clashHp(hp, l);
        return r >= hp / 4 && r <= hp;
      }),
    );
  });
});

describe('clash outcome by element (rule: the advantaged projectile survives, any other relation destroys both)', () => {
  const pairs = ELEMENTS.flatMap((a) => ELEMENTS.map((b) => [a, b] as const));

  it.each(pairs)('%s vs %s', (ea, eb) => {
    const [ra, sa] = RACE[ea];
    const [rb, sb] = RACE[eb];
    const world = duel(ra, rb);
    const s = world.state;
    const a = bullet(world, 0, sa, 600, 200, 40);
    const b = bullet(world, 1, sb, 610, 205, 30);
    const ev = step(world, [0, 0]);
    const clash = of(ev, K.clash);
    expect(clash).toHaveLength(1);
    const rel = elementRelation(ea, eb);
    const winner = rel === 'adv' ? a : rel === 'dis' ? b : -1;
    expect(clash[0]).toMatchObject({ sourceId: a, a, b, winner, ea: ELEMENTS.indexOf(ea), eb: ELEMENTS.indexOf(eb) });
    expect(isAlive(s, a)).toBe(winner === a);
    expect(isAlive(s, b)).toBe(winner === b);
    // The survivor keeps hp - loserHp / 2: 40 - 15 = 25 for a, 30 - 20 = 10 for b.
    if (winner === a) expect(s.hp[a]).toBe(25);
    if (winner === b) expect(s.hp[b]).toBe(10);
    // Destroyed projectiles give their active count back to their owners.
    expect(count(world, 0, sa)).toBe(winner === a ? 1 : 0);
    expect(count(world, 1, sb)).toBe(winner === b ? 1 : 0);
  });

  it('the cycle: fire beats air beats earth beats water beats fire; same element and void cancel', () => {
    const won = (ea: Element, eb: Element): number => {
      const world = duel(RACE[ea][0], RACE[eb][0]);
      bullet(world, 0, RACE[ea][1], 600);
      bullet(world, 1, RACE[eb][1], 610);
      return of(step(world, [0, 0]), K.clash)[0]?.winner ?? -2;
    };
    expect([won('fire', 'air'), won('air', 'earth'), won('earth', 'water'), won('water', 'fire')]).toEqual([2, 2, 2, 2]);
    expect([won('air', 'fire'), won('fire', 'water')]).toEqual([3, 3]);
    expect([won('fire', 'fire'), won('void', 'water'), won('fire', 'earth'), won('air', 'water')]).toEqual([-1, -1, -1, -1]);
  });

  it('the overlap centre is in the event, in whole pixels', () => {
    const world = duel('sindarosa', 'cyclonius');
    bullet(world, 0, 'fire-blast', 600, 200);
    bullet(world, 1, 'wind-cone', 615, 207);
    // x overlap 615..640, y overlap 207..220.
    expect(of(step(world, [0, 0]), K.clash)[0]).toMatchObject({ x: 628, y: 214 });
  });

  it('a strong loser cuts the winner to a quarter of its own damage, never lower', () => {
    const world = duel('morblass', 'sindarosa');
    const a = bullet(world, 0, 'icicles', 600, 200, 10);
    bullet(world, 1, 'fire-blast', 610, 200, 80);
    step(world, [0, 0]);
    expect(world.state.hp[a]).toBe(2.5);
  });
});

describe('clash pairing (rule: opposing teams only, pairs i < j in id order, one clash per projectile per tick)', () => {
  it('projectiles of the same team pass through each other', () => {
    const world = duel('sindarosa', 'cyclonius');
    const a = bullet(world, 0, 'fire-blast', 600);
    const b = bullet(world, 0, 'fire-blast', 610);
    expect(of(step(world, [0, 0]), K.clash)).toHaveLength(0);
    expect([isAlive(world.state, a), isAlive(world.state, b)]).toEqual([true, true]);
  });

  it('touching edges do not clash', () => {
    const world = duel('sindarosa', 'cyclonius');
    bullet(world, 0, 'fire-blast', 600);
    bullet(world, 1, 'wind-cone', 640);
    expect(of(step(world, [0, 0]), K.clash)).toHaveLength(0);
  });

  it('a survivor clashes at most once per tick: the next overlapping enemy waits for the next tick', () => {
    const world = duel('sindarosa', 'cyclonius');
    const s = world.state;
    const a = bullet(world, 0, 'fire-blast', 600, 200, 40);
    const b = bullet(world, 1, 'wind-cone', 610, 200, 10);
    const c = bullet(world, 1, 'wind-cone', 620, 200, 10);
    const first = of(step(world, [0, 0]), K.clash);
    expect(first.map((e) => [e.a, e.b, e.winner])).toEqual([[a, b, a]]);
    expect([isAlive(s, b), isAlive(s, c), s.hp[a]]).toEqual([false, true, 35]);
    const second = of(step(world, [0, 0]), K.clash);
    expect(second.map((e) => [e.a, e.b, e.winner])).toEqual([[a, c, a]]);
    expect(s.hp[a]).toBe(30);
  });

  it('pairs go in ascending id order: the lowest free id of the other team is the partner', () => {
    const world = duel('sindarosa', 'sindarosa');
    const a = bullet(world, 0, 'fire-blast', 600);
    const b = bullet(world, 1, 'fire-blast', 610);
    const c = bullet(world, 0, 'fire-blast', 615);
    const d = bullet(world, 1, 'fire-blast', 620);
    const ev = of(step(world, [0, 0]), K.clash);
    // a takes b (its first enemy); c takes d (b is gone).
    expect(ev.map((e) => [e.a, e.b])).toEqual([[a, b], [c, d]]);
  });

  it('capture effects and characters never clash', () => {
    const world = duel('sindarosa', 'cyclonius');
    const s = world.state;
    const a = bullet(world, 0, 'fire-blast', 600);
    const b = bullet(world, 1, 'wind-cone', 610);
    s.kind[b] = EntityKind.effect;
    expect(of(step(world, [0, 0]), K.clash)).toHaveLength(0);
    expect(isAlive(s, a)).toBe(true);
  });
});

describe('clash meter, freeze and parry (FUN-DESIGN 2.5, 2.2, 2.8)', () => {
  it('each side gains METER_CLASH, with meterLevel when a bar fills', () => {
    const world = duel('sindarosa', 'sindarosa');
    world.state.arcade[ARCADE_TEAM_BASE + ArcadeT.meter] = METER_BAR - METER_CLASH;
    bullet(world, 0, 'fire-blast', 600);
    bullet(world, 1, 'fire-blast', 610);
    const ev = step(world, [0, 0]);
    expect([meter(world, 0), meter(world, 1)]).toEqual([METER_BAR, METER_CLASH]);
    expect(of(ev, K.meterLevel)).toEqual([expect.objectContaining({ team: 0, bars: 1 })]);
    // clash first, then the meter.
    expect(ev.findIndex((e) => e.kind === K.clash)).toBeLessThan(ev.findIndex((e) => e.kind === K.meterLevel));
  });

  it('no clash while a freeze holds; it happens on the first unfrozen tick, and sets no hit-stop of its own', () => {
    const world = duel('sindarosa', 'cyclonius');
    const s = world.state;
    s.arcade[ARCADE_WORLD_BASE + ArcadeW.freezeUntil] = (s.world[World.tick] ?? 0) + 3;
    bullet(world, 0, 'fire-blast', 600);
    bullet(world, 1, 'wind-cone', 610);
    const frozen = [step(world, [0, 0]), step(world, [0, 0]), step(world, [0, 0])].flat();
    expect(of(frozen, K.clash)).toHaveLength(0);
    const ev = step(world, [0, 0]);
    expect(of(ev, K.clash)).toHaveLength(1);
    expect(of(ev, K.hitStop)).toHaveLength(0);
  });

  it('a reflected projectile clashes as the parrier\'s: its team and element', () => {
    // p1 (fire) shoots two blasts in a row at p2 (water), who parries the first: the reflection meets the second.
    const world = duel('sindarosa', 'morblass');
    const s = world.state;
    const w = 40;
    const y = 300 + (CHARACTER_HEIGHT - 20) / 2;
    const p = bullet(world, 0, 'fire-blast', 900 - w + 10, y);
    const q = bullet(world, 0, 'fire-blast', 900 - w - 10, y);
    s.vx[p] = 8;
    s.vx[q] = 8;
    s.arcade[ARCADE_E + ArcadeE.parryUntil] = now(s) + 5;
    const ev = step(world, [0, 0]);
    expect(of(ev, K.parried)).toEqual([expect.objectContaining({ target: 1, reflected: 1 })]);
    const clash = of(ev, K.clash);
    expect(clash).toHaveLength(1);
    // Water (the parrier's element) beats fire: the reflection survives and the second blast is gone.
    expect(clash[0]).toMatchObject({ a: p, b: q, winner: p, ea: ELEMENTS.indexOf('water'), eb: ELEMENTS.indexOf('fire') });
    expect(s.team[p]).toBe(1);
    expect(isAlive(s, q)).toBe(false);
    expect(s.hp[p]).toBe(40 - 40 / 2);
  });
});

describe('clash in a played match', () => {
  /** p1 (fire) and p2 (air) fire on the same row: the blasts meet in the middle and fire wins. */
  function shootout(arcade: boolean): { world: SimWorld; events: SimEvent[] } {
    const world = duel('sindarosa', 'cyclonius', arcade);
    const events: SimEvent[] = [];
    events.push(...step(world, [Cmd.primary, Cmd.secondary]));
    for (let t = 0; t < 120; t++) events.push(...step(world, [0, 0]));
    return { world, events };
  }

  it('Arcade: the blast and the cone clash once, fire wins, and the blast flies on', () => {
    const { events } = shootout(true);
    const clash = of(events, K.clash);
    expect(clash).toHaveLength(1);
    expect(clash[0]?.winner).toBe(clash[0]?.a);
    // The surviving blast still reaches p2.
    expect(of(events, K.hitConfirmed).filter((e) => e.target === 1)).toHaveLength(1);
    expect(of(events, K.hitConfirmed).filter((e) => e.target === 0)).toHaveLength(0);
  });

  it('Classic: the same shots pass through each other and both land', () => {
    const { events } = shootout(false);
    expect(of(events, K.clash)).toHaveLength(0);
    expect(new Set(of(events, K.damage).map((e) => e.target))).toEqual(new Set([0, 1]));
  });

  it('is deterministic: the same run gives the same hash, and a snapshot restored before the clash replays it', () => {
    expect(hash(shootout(true).world.state)).toBe(hash(shootout(true).world.state));
    const world = duel('sindarosa', 'cyclonius');
    step(world, [Cmd.primary, Cmd.secondary]);
    const buf = createSnapshotBuf(world.state);
    snapshot(world.state, buf);
    const run = (): string => {
      const ev: SimEvent[] = [];
      for (let t = 0; t < 60; t++) ev.push(...step(world, [0, 0]));
      return JSON.stringify(of(ev, K.clash)) + String(hash(world.state));
    };
    const first = run();
    restore(world.state, buf);
    expect(run()).toBe(first);
    expect(first).toContain('"winner"');
  });
});

describe('clash properties', () => {
  const slugs = Object.values(RACE).map(([, shot]) => shot);
  const races = Object.values(RACE).map(([race]) => race);
  const layout = fc.record({
    p1: fc.constantFrom(...races),
    p2: fc.constantFrom(...races),
    shots: fc.array(
      fc.record({ team: fc.integer({ min: 0, max: 1 }), x: fc.integer({ min: 0, max: 120 }), y: fc.integer({ min: 0, max: 40 }), hp: fc.integer({ min: 0, max: 80 }) }),
      { maxLength: 40 },
    ),
  });

  it('one clash per projectile per tick, opposing overlapping pairs only, survivors within [hp / 4, hp], meter per clash, maximal', () => {
    fc.assert(
      fc.property(layout, ({ p1, p2, shots }) => {
        const world = duel(p1, p2);
        const s = world.state;
        const ids = shots.map((b) => bullet(world, b.team, slugs[races.indexOf(b.team === 0 ? p1 : p2)] ?? 'fire-blast', 400 + b.x, 50 + b.y, b.hp));
        const before = new Map(ids.map((id) => [id, { team: s.team[id] ?? 0, hp: s.hp[id] ?? 0, x: s.x[id] ?? 0, y: s.y[id] ?? 0 }]));
        const sink = new EventSink(0);
        arcadeClashSystem(world, [0, 0], sink);
        const clashes = of(sink.events, K.clash);
        const seen = new Set<number>();
        for (const e of clashes) {
          const a = e.a ?? -1;
          const b = e.b ?? -1;
          expect(a).toBeLessThan(b);
          expect(seen.has(a) || seen.has(b)).toBe(false);
          seen.add(a).add(b);
          const ba = before.get(a);
          const bb = before.get(b);
          expect(ba?.team).not.toBe(bb?.team);
          expect(Math.abs((ba?.x ?? 0) - (bb?.x ?? 0)) < 40 && Math.abs((ba?.y ?? 0) - (bb?.y ?? 0)) < 20).toBe(true);
          for (const id of [a, b]) {
            const hp = before.get(id)?.hp ?? 0;
            if (e.winner === id) {
              expect(isAlive(s, id)).toBe(true);
              expect(s.hp[id]).toBeGreaterThanOrEqual(hp / 4);
              expect(s.hp[id]).toBeLessThanOrEqual(hp);
            } else expect(isAlive(s, id)).toBe(false);
          }
        }
        for (const team of [0, 1]) expect(meter(world, team)).toBe(Math.min(3000, clashes.length * METER_CLASH));
        // Maximal: two live opposing projectiles that still overlap were not both free this tick.
        const alive = ids.filter((id) => isAlive(s, id));
        for (const i of alive) {
          for (const j of alive) {
            if (i >= j || s.team[i] === s.team[j]) continue;
            const overlapping = Math.abs((s.x[i] ?? 0) - (s.x[j] ?? 0)) < 40 && Math.abs((s.y[i] ?? 0) - (s.y[j] ?? 0)) < 20;
            if (overlapping) expect(seen.has(i) || seen.has(j)).toBe(true);
          }
        }
      }),
      { numRuns: 200 },
    );
  });

  it('Classic never clashes: the slot leaves state and events untouched', () => {
    fc.assert(
      fc.property(layout, ({ p1, p2, shots }) => {
        const world = duel(p1, p2, false);
        for (const b of shots) bullet(world, b.team, 'fire-blast', 400 + b.x, 50 + b.y, b.hp);
        const h = hash(world.state);
        const sink = new EventSink(0);
        arcadeClashSystem(world, [0, 0], sink);
        expect(sink.events).toHaveLength(0);
        expect(hash(world.state)).toBe(h);
        expect(world.state.arcade).toHaveLength(0);
      }),
      { numRuns: 50 },
    );
  });
});
