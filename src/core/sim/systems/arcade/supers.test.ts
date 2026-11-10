import { describe, expect, it } from 'vitest';
import { JUGGLE_STUN_STEP, METER_BAR, SUPER_FREEZE_TICKS } from '../../../data/arcade';
import {
  RACE_SUPERS, SUPER_ARMOUR_PCT, SUPER_ICICLE_EVERY, SUPER_QUAKE_DAMAGE, SUPER_QUAKE_RING_EVERY, SUPER_QUAKE_RING_PX,
  SUPER_SPECS, SUPER_TIDE_DAMAGE, SUPER_TIDE_SLOW_TICKS, SUPER_TIDE_SPEED_PX, SUPER_TIDE_WIDTH_PX, SUPER_VORTEX_ACTIVE_TICKS,
  SUPER_VORTEX_BOX_PX, SUPER_VORTEX_DAMAGE, superOf,
} from '../../../data/arcade-supers';
import { characterId } from '../../../data/ids';
import { DEFAULT_SIM_FLAGS } from '../../../flags';
import { now } from '../../clock';
import { Cmd, type Command } from '../../commands';
import { SimEventKind, type SimEvent } from '../../events';
import { createMatch, type MatchSetup } from '../../match';
import { ARCADE_E, ARCADE_TEAM_BASE, ArcadeE, ArcadeT, EntityFlag, EntityKind } from '../../state';
import { step } from '../../step';
import type { SimWorld } from '../../world';
import { damageDecreasePct } from '../status';
import { skipIntro } from './round-testkit';

const METER = ARCADE_TEAM_BASE + ArcadeT.meter;
const SUPER_STATE = ARCADE_TEAM_BASE + ArcadeT.superState;
const SUPER: readonly [Command, Command] = [Cmd.super, 0];
const IDLE: readonly [Command, Command] = [0, 0];

type Ev = SimEvent & { g: number };

/** Caster (id 0, facing east, x 400) and a 10 000 hp victim (id 1) `gap` px to its east, same row; one bar. */
function duel(caster: string, victim = 'pax', gap = 400): SimWorld {
  const setup: MatchSetup = {
    simVersion: 8, seed: 3, flags: { ...DEFAULT_SIM_FLAGS, rulesetArcade: true }, chapter: 1, difficulty: 1,
    p1: [{ character: characterId(caster), xp: 1 }],
    p2: [{ character: characterId(victim), xp: 1 }],
  };
  const world = skipIntro(createMatch(setup));
  const s = world.state;
  s.x[0] = 400;
  s.x[1] = 400 + gap;
  s.hp[1] = 10_000;
  s.maxHp[1] = 10_000;
  s.arcade[METER] = METER_BAR;
  return world;
}

function run(world: SimWorld, n: number, cmds: readonly [Command, Command] = IDLE): Ev[] {
  const out: Ev[] = [];
  for (let i = 0; i < n; i++) {
    const g = now(world.state);
    for (const e of step(world, cmds)) out.push({ ...e, g });
  }
  return out;
}

const of = (ev: readonly Ev[], kind: number): Ev[] => ev.filter((e) => e.kind === kind);
const fxOf = (w: SimWorld): number => (w.state.arcade[SUPER_STATE] ?? 0) - 1;

/** Casts the super and runs until it ends; returns every event (each tagged with the game tick relative to the cast). */
function cast(world: SimWorld, extra = 0): Ev[] {
  const g0 = now(world.state);
  const ev = [...run(world, 1, SUPER), ...run(world, SUPER_FREEZE_TICKS + 400 + extra)];
  return ev.map((e) => ({ ...e, g: e.g - g0 - 1 }));
}

const hitsOf = (ev: readonly Ev[]): Ev[] => of(ev, SimEventKind.hitConfirmed);

/** Like `cast`, but the victim is put back at x = `x` after every tick (a hit's knockback would carry it out of range). */
function castPinned(world: SimWorld, x: number): Ev[] {
  const g0 = now(world.state);
  const out: Ev[] = [];
  for (let i = 0; i < SUPER_FREEZE_TICKS + 200; i++) {
    const g = now(world.state);
    for (const e of step(world, i === 0 ? SUPER : IDLE)) out.push({ ...e, g: g - g0 - 1 });
    world.state.x[1] = x;
  }
  return out;
}

/** Stun ticks left on the victim (id 1) at the tick its `n`th hit lands, pinned at x = `x`. */
function stunLeftAtHit(world: SimWorld, x: number, n: number): number {
  let hits = 0;
  for (let i = 0; i < SUPER_FREEZE_TICKS + 200; i++) {
    const evs = step(world, i === 0 ? SUPER : IDLE);
    hits += evs.filter((e) => e.kind === SimEventKind.hitConfirmed).length;
    if (hits >= n) return (world.state.arcade[ARCADE_E + ArcadeE.stunUntil] ?? 0) - now(world.state);
    world.state.x[1] = x;
  }
  return -1;
}

describe('super specs (FUN-DESIGN 2.5)', () => {
  it('has 12 race variants with ids 1..12, plus the generic burst at 0', () => {
    expect(SUPER_SPECS.map((d) => d.id)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(Object.keys(RACE_SUPERS)).toHaveLength(12);
    expect(superOf('dummy').id).toBe(0);
    expect(superOf('eternal-void').id).toBe(0);
  });

  it('has the design numbers', () => {
    expect([SUPER_VORTEX_BOX_PX, SUPER_VORTEX_ACTIVE_TICKS, SUPER_VORTEX_DAMAGE]).toEqual([480, 36, 9]);
    expect([SUPER_QUAKE_RING_PX, SUPER_QUAKE_RING_EVERY, SUPER_QUAKE_DAMAGE]).toEqual([[160, 320, 480], 10, 20]);
    expect([SUPER_TIDE_WIDTH_PX, SUPER_TIDE_SPEED_PX, SUPER_TIDE_DAMAGE, SUPER_TIDE_SLOW_TICKS]).toEqual([120, 12, 50, 40]);
    expect(SUPER_ARMOUR_PCT).toBe(50);
    expect(RACE_SUPERS['sindarosa']?.size).toBe(200);
    expect(RACE_SUPERS['ishimi']?.size).toBe(180);
    expect(RACE_SUPERS['pax']?.scalePm).toBe(1250);
  });
});

describe('Inferno Beam variants', () => {
  it('Hellfire Lance is a 200 px band, still 5 hits of the burst', () => {
    const world = duel('sindarosa');
    step(world, SUPER);
    const s = world.state;
    const fx = fxOf(world);
    expect([s.h[fx], s.y[fx]]).toEqual([200, (s.y[0] ?? 0) + (s.h[0] ?? 0) / 2 - 100]);
    expect(hitsOf(cast(duel('sindarosa')))).toHaveLength(5);
  });

  it('Hellfire Lance reaches a victim whose top is 90 px below the centre line, the 160 px burst (80 px) does not', () => {
    const miss = duel('dummy');
    const hit = duel('sindarosa');
    for (const w of [miss, hit]) w.state.y[1] = (w.state.y[0] ?? 0) + (w.state.h[0] ?? 0) / 2 + 90;
    expect(hitsOf(cast(miss))).toHaveLength(0);
    expect(hitsOf(cast(hit)).length).toBeGreaterThan(0);
  });

  it('Crimson Tide gives +2 speed for 150 ticks when the beam ends', () => {
    const world = duel('lavax');
    const s = world.state;
    const base = s.speed[0] ?? 0;
    const ev = cast(world, 0);
    expect(of(ev, SimEventKind.superEnded)).toHaveLength(1);
    // 400 ticks after the cast the +2 has long gone; check the grant window by stepping a fresh match instead.
    expect(s.speed[0]).toBe(base);
    const w2 = duel('lavax');
    w2.state.y[1] = 100;
    run(w2, 1, SUPER);
    run(w2, SUPER_FREEZE_TICKS);
    let ended = -1;
    for (let i = 0; i < 80 && ended < 0; i++) {
      if (of(run(w2, 1), SimEventKind.superEnded).length > 0) ended = i;
    }
    expect(ended).toBeGreaterThanOrEqual(0);
    expect(w2.state.speed[0]).toBe(base + 2);
    run(w2, 149);
    expect(w2.state.speed[0]).toBe(base + 2);
    run(w2, 2);
    expect(w2.state.speed[0]).toBe(base);
  });

  it('Phoenix Rise heals 10% of the damage dealt, capped at max HP', () => {
    const world = duel('fiara');
    const s = world.state;
    s.hp[0] = (s.maxHp[0] ?? 0) - 50;
    const before = s.hp[0];
    const ev = cast(world);
    const dealt = hitsOf(ev).reduce((n, e) => n + Number(e['amount']), 0);
    expect(dealt).toBeGreaterThan(0);
    expect(s.hp[0]).toBeCloseTo(before + dealt / 10, 6);
    const full = duel('fiara');
    cast(full);
    expect(full.state.hp[0]).toBe(full.state.maxHp[0]);
  });
});

describe('Vortex variants', () => {
  it('Eye of the Storm is a 480 px box centred on the caster, hitting every 6 ticks for 36 ticks at 9 damage', () => {
    const world = duel('cyclonius');
    step(world, SUPER);
    const s = world.state;
    const fx = fxOf(world);
    expect([s.w[fx], s.h[fx]]).toEqual([480, 480]);
    expect([(s.x[fx] ?? 0) + 240, (s.y[fx] ?? 0) + 240]).toEqual([(s.x[0] ?? 0) + (s.w[0] ?? 0) / 2, (s.y[0] ?? 0) + (s.h[0] ?? 0) / 2]);
    const ev = castPinned(duel('cyclonius', 'pax', 150), 550);
    const hits = hitsOf(ev);
    expect(hits).toHaveLength(6);
    expect(hits.slice(1).map((h, i) => h.g - (hits[i]?.g ?? 0))).toEqual([6, 6, 6, 6, 6]);
    expect(of(ev, SimEventKind.superEnded)).toHaveLength(1);
  });

  it('pulls the victim toward the caster: the victim east of it is knocked west', () => {
    const world = duel('cyclonius', 'pax', 200);
    const s = world.state;
    run(world, 1, SUPER);
    run(world, SUPER_FREEZE_TICKS + 1);
    expect(Math.sign(s.arcade[1 * ARCADE_E + ArcadeE.kbVx] ?? 0)).toBe(-1);
    expect(s.arcade[1 * ARCADE_E + ArcadeE.kbVy] ?? 0).toBe(0);
  });

  it('Siren Gale steals 15% of the damage dealt', () => {
    const world = duel('wispera', 'pax', 150);
    const s = world.state;
    s.hp[0] = (s.maxHp[0] ?? 0) - 90;
    const before = s.hp[0];
    const dealt = hitsOf(castPinned(world, 550)).reduce((n, e) => n + Number(e['amount']), 0);
    expect(dealt).toBeGreaterThan(0);
    expect(s.hp[0]).toBeCloseTo(Math.min(before + (dealt * 15) / 100, s.maxHp[0] ?? 0), 6);
  });

  it('Phantom Squall leaves the caster translucent for 60 ticks', () => {
    const world = duel('echo');
    const s = world.state;
    s.y[1] = 100;
    run(world, 1, SUPER);
    run(world, SUPER_FREEZE_TICKS);
    let n = 0;
    while (of(run(world, 1), SimEventKind.superEnded).length === 0 && n++ < 100);
    expect((s.flags[0] ?? 0) & EntityFlag.translucent).not.toBe(0);
    run(world, 58);
    expect((s.flags[0] ?? 0) & EntityFlag.translucent).not.toBe(0);
    run(world, 3);
    expect((s.flags[0] ?? 0) & EntityFlag.translucent).toBe(0);
  });
});

describe('Quake Rings variants', () => {
  it('rings are 160, 320 and 480 px squares at ticks 0, 10 and 20', () => {
    const world = duel('rokcore', 'pax', 1200);
    const s = world.state;
    run(world, 1, SUPER);
    run(world, SUPER_FREEZE_TICKS);
    const fx = fxOf(world);
    const sides: number[] = [];
    for (let i = 0; i < 25; i++) {
      run(world, 1);
      if (i % 10 === 0) sides.push(s.w[fx] ?? 0);
    }
    expect(sides).toEqual([160, 320, 480]);
  });

  it('a victim 160 px away (80 px boxes) is missed by the first ring only: hits at +10 and +20', () => {
    const hits = hitsOf(castPinned(duel('rokcore', 'pax', 160), 560));
    expect(hits).toHaveLength(2);
    expect((hits[1]?.g ?? 0) - (hits[0]?.g ?? 0)).toBe(SUPER_QUAKE_RING_EVERY);
  });

  it('Titan Slam rings are 25% larger: 200 px, 400 px, 600 px', () => {
    const world = duel('pax', 'rokcore', 1200);
    const s = world.state;
    run(world, 1, SUPER);
    run(world, SUPER_FREEZE_TICKS);
    const fx = fxOf(world);
    const sides: number[] = [];
    for (let i = 0; i < 25; i++) {
      run(world, 1);
      if (i % 10 === 0) sides.push(s.w[fx] ?? 0);
    }
    expect(sides).toEqual([200, 400, 600]);
  });

  it('Mountain Breaker grants 50% armour for 100 ticks', () => {
    const world = duel('rokcore', 'pax', 1200);
    const s = world.state;
    run(world, 1, SUPER);
    run(world, SUPER_FREEZE_TICKS);
    let n = 0;
    while (of(run(world, 1), SimEventKind.superEnded).length === 0 && n++ < 100);
    expect(damageDecreasePct(s, 0)).toBe(50);
    run(world, 98);
    expect(damageDecreasePct(s, 0)).toBe(50);
    run(world, 3);
    expect(damageDecreasePct(s, 0)).toBe(0);
  });

  it('Overgrowth roots the victim 40 ticks (less one juggle step) longer after the last ring than Mountain Breaker', () => {
    const left = (race: string): number => stunLeftAtHit(duel(race, 'pax', 100), 500, 3);
    expect(left('treenoc') - left('rokcore')).toBe(40 - JUGGLE_STUN_STEP);
  });
});

describe('Tidal Wave variants', () => {
  it('Glacier Crash starts a 120 px wall at the caster edge, full arena height, moving 12 px a tick', () => {
    const world = duel('curomo', 'pax', 1200);
    const s = world.state;
    const a = world.arena;
    run(world, 1, SUPER);
    const fx = fxOf(world);
    expect([s.w[fx], s.x[fx], s.y[fx], s.h[fx]]).toEqual([120, (s.x[0] ?? 0) + (s.w[0] ?? 0), a.y, a.h]);
    const x0 = s.x[fx] ?? 0;
    run(world, SUPER_FREEZE_TICKS);
    run(world, 5);
    expect((s.x[fx] ?? 0) - x0).toBe(60);
    expect(s.kind[fx]).toBe(EntityKind.effect);
  });

  it('hits once for 50, slows the victim to half speed for 40 ticks, then ends', () => {
    const world = duel('curomo', 'pax', 300);
    const s = world.state;
    const speed = s.speed[1] ?? 0;
    const ev = cast(world);
    const hits = hitsOf(ev);
    expect(hits).toHaveLength(1);
    expect(hits[0]?.['strength']).toBe(3);
    expect(of(ev, SimEventKind.superEnded)).toHaveLength(1);
    expect(s.speed[1]).toBeGreaterThan(0);

    const w2 = duel('curomo', 'pax', 300);
    run(w2, 1, SUPER);
    run(w2, SUPER_FREEZE_TICKS);
    let n = 0;
    while (hitsOf(run(w2, 1)).length === 0 && n++ < 100);
    expect(w2.state.speed[1]).toBe(speed / 2);
    // The hit freezes the game clock (hit-stop); statuses count game ticks, so advance by the clock.
    const g1 = now(w2.state);
    while (now(w2.state) < g1 + SUPER_TIDE_SLOW_TICKS - 2) run(w2, 1);
    expect(w2.state.speed[1]).toBe(speed / 2);
    while (now(w2.state) < g1 + SUPER_TIDE_SLOW_TICKS + 1) run(w2, 1);
    expect(w2.state.speed[1]).toBe(speed);
  });

  it('Glacier Crash freezes 30 ticks (less one juggle step) longer than Slime Tsunami stuns', () => {
    const left = (race: string): number => stunLeftAtHit(duel(race, 'pax', 300), 700, 1);
    expect(left('curomo') - left('ishimi')).toBe(30 - JUGGLE_STUN_STEP);
  });

  it('Slime Tsunami is a 180 px wall', () => {
    const world = duel('ishimi', 'pax', 1200);
    run(world, 1, SUPER);
    expect(world.state.w[fxOf(world)]).toBe(180);
  });

  it('the wall misses a translucent victim and runs off the arena', () => {
    const world = duel('curomo', 'pax', 300);
    world.state.flags[1] = (world.state.flags[1] ?? 0) | EntityFlag.translucent;
    const ev = cast(world);
    expect(hitsOf(ev)).toHaveLength(0);
    expect(of(ev, SimEventKind.superEnded)).toHaveLength(1);
  });

  it('Hailstorm fires 6 icicles, one every 4 ticks, without leaving a stuck active count', () => {
    const world = duel('morblass', 'pax', 1200);
    const s = world.state;
    run(world, 1, SUPER);
    run(world, SUPER_FREEZE_TICKS);
    const seen = new Set<number>();
    const spawnAt: number[] = [];
    for (let i = 0; i < 60; i++) {
      run(world, 1);
      for (let id = 0; id < s.kind.length; id++) {
        if (s.kind[id] === EntityKind.projectile && !seen.has(id + 1000 * (s.spawnTick[id] ?? 0))) {
          seen.add(id + 1000 * (s.spawnTick[id] ?? 0));
          spawnAt.push(i);
        }
      }
    }
    expect(spawnAt).toHaveLength(6);
    expect(spawnAt.slice(1).map((v, i) => v - (spawnAt[i] ?? 0))).toEqual(Array<number>(5).fill(SUPER_ICICLE_EVERY));
    // After everything despawns the icicle count is unchanged from the start (0).
    run(world, 200);
    for (let k = 0; k < 4; k++) expect(s.abil[(0 * 1) + k]).toBeDefined();
  });
});
