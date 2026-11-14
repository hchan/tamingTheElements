import { describe, expect, it } from 'vitest';
import {
  HAZARD_ACTIVE_TICKS, HAZARD_DAMAGE_PM, HAZARD_FIRST_TICKS, HAZARD_GUST_AIR_PX, HAZARD_GUST_H, HAZARD_GUST_PX,
  HAZARD_JITTER_TICKS, HAZARD_LAVA_LANES, HAZARD_LAVA_W, HAZARD_PERIOD_TICKS, HAZARD_ROCK_PX, HAZARD_TIDE_PX,
  HAZARD_WARN_TICKS, HP_PM, RoundPhase,
} from '../../../data/arcade';
import { characterId } from '../../../data/ids';
import { DEFAULT_SIM_FLAGS } from '../../../flags';
import { now } from '../../clock';
import { SimEventKind, type SimEvent } from '../../events';
import { hash } from '../../hash';
import { createMatch, type MatchSetup } from '../../match';
import { createSnapshotBuf, restore, snapshot } from '../../snapshot';
import { ARCADE_E, ARCADE_WORLD_BASE, ArcadeE, ArcadeW, HAZARD_BASE, HazardF } from '../../state';
import { step } from '../../step';
import { createRenderView, HAZARD_VIEW_STRIDE } from '../../view';
import type { SimWorld } from '../../world';
import { clearHazard, hazardOf } from './hazard';
import { skipIntro } from './round-testkit';

const K = SimEventKind;
const AW = (f: number): number => ARCADE_WORLD_BASE + f;
const HZ = (f: number): number => ARCADE_WORLD_BASE + HAZARD_BASE + f;

/** p1 (id 0) at (300, 300) against p2 (id 1) at (900, 300), in the fight on a stage of `stage` (0 none, 1 fire .. 4 air) with no patches. */
function duel(stage: number, seed = 9, arcade = true): SimWorld {
  const setup: MatchSetup = {
    simVersion: 54, seed, flags: { ...DEFAULT_SIM_FLAGS, rulesetArcade: arcade }, chapter: 1, difficulty: 1,
    p1: [{ character: characterId('fiara'), xp: 1 }],
    p2: [{ character: characterId('pax'), xp: 1 }],
  };
  const world = arcade ? skipIntro(createMatch(setup)) : createMatch(setup);
  const s = world.state;
  if (arcade) {
    s.arcade[AW(ArcadeW.stage)] = stage;
    s.arcade[AW(ArcadeW.patchCount)] = 0;
  }
  s.x[0] = 300; s.y[0] = 300; s.dir[0] = 0;
  s.x[1] = 900; s.y[1] = 300; s.dir[1] = 4;
  return world;
}

const of = (evs: readonly SimEvent[], kind: number): SimEvent[] => evs.filter((e) => e.kind === kind);

function run(world: SimWorld, n: number): SimEvent[] {
  let out: SimEvent[] = [];
  for (let i = 0; i < n; i++) out = out.concat(step(world, [0, 0]));
  return out;
}

/** Steps until a hazard warning (at most 3000 ticks); returns the steps taken and the warning. */
function toWarn(world: SimWorld): { readonly steps: number; readonly warn: SimEvent } {
  for (let i = 1; i <= 3000; i++) {
    const warn = of(step(world, [0, 0]), K.hazardWarn)[0];
    if (warn) return { steps: i, warn };
  }
  throw new Error('no hazard warning');
}

/** The live hazard box. */
const box = (world: SimWorld): { x: number; y: number; w: number; h: number } => {
  const a = world.state.arcade;
  return { x: a[HZ(HazardF.x)] ?? 0, y: a[HZ(HazardF.y)] ?? 0, w: a[HZ(HazardF.w)] ?? 0, h: a[HZ(HazardF.h)] ?? 0 };
};

/** Moves fighter `id` into the live hazard box (its centre) and the other one out of it. */
function standIn(world: SimWorld, id: number): void {
  const s = world.state;
  const b = box(world);
  const ar = world.arena;
  s.x[id] = Math.trunc(b.x + b.w / 2 - (s.w[id] ?? 0) / 2);
  s.y[id] = Math.trunc(b.y + b.h / 2 - (s.h[id] ?? 0) / 2);
  const other = 1 - id;
  s.y[other] = Math.trunc(b.y + b.h / 2 - (s.h[other] ?? 0) / 2);
  s.x[other] = b.x + b.w / 2 > ar.x + ar.w / 2 ? ar.x : ar.x + ar.w - (s.w[other] ?? 0);
}

describe('stage hazard data', () => {
  it('has the design numbers', () => {
    expect([HAZARD_FIRST_TICKS, HAZARD_WARN_TICKS, HAZARD_PERIOD_TICKS, HAZARD_JITTER_TICKS]).toEqual([400, 50, 650, 200]);
    expect([...HAZARD_ACTIVE_TICKS]).toEqual([0, 20, 150, 20, 100]);
    expect([...HAZARD_DAMAGE_PM]).toEqual([0, 40, 0, 50, 0]);
    expect([HAZARD_LAVA_LANES, HAZARD_LAVA_W, HAZARD_ROCK_PX, HAZARD_TIDE_PX, HAZARD_GUST_H, HAZARD_GUST_PX, HAZARD_GUST_AIR_PX])
      .toEqual([5, 96, 176, 1, 120, 1, 4]);
  });

  it('keeps hazard damage small: at most 5% of max life', () => {
    for (const pm of HAZARD_DAMAGE_PM) expect(pm).toBeLessThanOrEqual(HP_PM / 20);
  });
});

describe('stage hazard timing', () => {
  it.each([1, 2, 3, 4])('stage %i warns HAZARD_FIRST_TICKS into the fight, strikes HAZARD_WARN_TICKS later and ends', (stage) => {
    const world = duel(stage);
    const { steps, warn } = toWarn(world);
    expect(steps).toBe(HAZARD_FIRST_TICKS + 1);
    expect(warn).toMatchObject({ hazard: stage, ticks: HAZARD_WARN_TICKS });
    expect(hazardOf(world.state)).toEqual({ kind: stage, active: false });
    expect(of(run(world, HAZARD_WARN_TICKS - 1), K.hazardStrike)).toHaveLength(0);
    expect(of(run(world, 1), K.hazardStrike)).toMatchObject([{ hazard: stage }]);
    expect(hazardOf(world.state)).toEqual({ kind: stage, active: true });
    run(world, HAZARD_ACTIVE_TICKS[stage] ?? 0);
    expect(hazardOf(world.state).kind).toBe(0);
  });

  it('the next warning comes HAZARD_PERIOD_TICKS plus a seeded jitter after the last one ends', () => {
    const world = duel(1);
    toWarn(world);
    const next = toWarn(world).steps;
    const gap = next - (HAZARD_WARN_TICKS + (HAZARD_ACTIVE_TICKS[1] ?? 0));
    expect(gap).toBeGreaterThanOrEqual(HAZARD_PERIOD_TICKS);
    expect(gap).toBeLessThan(HAZARD_PERIOD_TICKS + HAZARD_JITTER_TICKS);
  });

  it('a stage with no element has no hazard', () => {
    const world = duel(0);
    expect(of(run(world, HAZARD_FIRST_TICKS + 200), K.hazardWarn)).toHaveLength(0);
  });

  it('Classic has no hazard block and no hazard events', () => {
    const world = duel(0, 9, false);
    expect(world.state.arcade.length).toBe(0);
    const evs = run(world, HAZARD_FIRST_TICKS + 200);
    expect([K.hazardWarn, K.hazardStrike, K.hazardHit].flatMap((k) => of(evs, k))).toHaveLength(0);
  });
});

describe('stage hazard draws', () => {
  it('a lava vent fills one of HAZARD_LAVA_LANES fixed lanes, top to bottom', () => {
    const lanes = new Set<number>();
    for (let seed = 1; seed <= 12; seed++) {
      const world = duel(1, seed);
      toWarn(world);
      const b = box(world);
      const ar = world.arena;
      expect([b.y, b.w, b.h]).toEqual([ar.y, HAZARD_LAVA_W, ar.h]);
      const lane = Math.round(((b.x + b.w / 2 - ar.x) * (HAZARD_LAVA_LANES + 1)) / ar.w) - 1;
      expect(lane).toBeGreaterThanOrEqual(0);
      expect(lane).toBeLessThan(HAZARD_LAVA_LANES);
      lanes.add(lane);
    }
    expect(lanes.size).toBeGreaterThan(1);
  });

  it('a rockfall square lands on a fighter where it stood at the warning', () => {
    const world = duel(3);
    toWarn(world);
    const s = world.state;
    const b = box(world);
    expect([b.w, b.h]).toEqual([HAZARD_ROCK_PX, HAZARD_ROCK_PX]);
    const covers = (id: number): boolean => (s.x[id] ?? 0) < b.x + b.w && b.x < (s.x[id] ?? 0) + (s.w[id] ?? 0);
    expect(covers(0) || covers(1)).toBe(true);
  });

  it('a tide covers the field and a gust a HAZARD_GUST_H band, each with a direction', () => {
    for (const stage of [2, 4]) {
      const world = duel(stage);
      toWarn(world);
      const b = box(world);
      const ar = world.arena;
      expect([b.x, b.w]).toEqual([ar.x, ar.w]);
      expect(b.h).toBe(stage === 2 ? ar.h : HAZARD_GUST_H);
      expect(b.y).toBeGreaterThanOrEqual(ar.y);
      expect(b.y + b.h).toBeLessThanOrEqual(ar.y + ar.h);
      expect([-1, 1]).toContain(world.state.arcade[HZ(HazardF.dir)]);
    }
  });
});

describe('stage hazard effects', () => {
  it.each([1, 3])('stage %i takes HAZARD_DAMAGE_PM of max life from a fighter in the box on the strike tick only', (stage) => {
    const world = duel(stage);
    toWarn(world);
    standIn(world, 0);
    const s = world.state;
    const hp0 = s.hp[0] ?? 0;
    const hp1 = s.hp[1] ?? 0;
    const evs = run(world, HAZARD_WARN_TICKS);
    const amount = Math.floor(((s.maxHp[0] ?? 0) * (HAZARD_DAMAGE_PM[stage] ?? 0)) / HP_PM);
    expect(amount).toBeGreaterThan(0);
    expect(of(evs, K.hazardHit)).toMatchObject([{ sourceId: 0, team: 0, amount, hazard: stage }]);
    expect(s.hp[0]).toBe(hp0 - amount);
    expect(s.hp[1]).toBe(hp1);
    expect(of(run(world, HAZARD_ACTIVE_TICKS[stage] ?? 0), K.hazardHit)).toHaveLength(0);
  });

  it('never takes the last point of life', () => {
    const world = duel(1);
    toWarn(world);
    standIn(world, 0);
    world.state.hp[0] = 2;
    const evs = run(world, HAZARD_WARN_TICKS);
    expect(world.state.hp[0]).toBe(1);
    expect(of(evs, K.hazardHit)).toMatchObject([{ amount: 1 }]);
    world.state.hp[0] = 1;
    expect(of(run(world, 1), K.hazardHit)).toHaveLength(0);
  });

  it('skips an invulnerable fighter', () => {
    const world = duel(3);
    toWarn(world);
    standIn(world, 0);
    const s = world.state;
    s.arcade[ARCADE_E * 0 + ArcadeE.invulnUntil] = now(s) + HAZARD_WARN_TICKS + 5;
    const hp = s.hp[0];
    const evs = run(world, HAZARD_WARN_TICKS);
    expect(of(evs, K.hazardStrike)).toHaveLength(1);
    expect(of(evs, K.hazardHit)).toHaveLength(0);
    expect(s.hp[0]).toBe(hp);
  });

  it('a tide drifts both fighters HAZARD_TIDE_PX a tick its way while active', () => {
    const world = duel(2);
    toWarn(world);
    const s = world.state;
    const dir = s.arcade[HZ(HazardF.dir)] ?? 0;
    s.x[0] = 500; s.x[1] = 700;
    run(world, HAZARD_WARN_TICKS - 1);
    expect([s.x[0], s.x[1]]).toEqual([500, 700]);
    run(world, 10);
    expect([s.x[0], s.x[1]]).toEqual([500 + dir * 10 * HAZARD_TIDE_PX, 700 + dir * 10 * HAZARD_TIDE_PX]);
  });

  it('a gust nudges only a fighter in its band, harder while it is airborne (dashing)', () => {
    const nudge = (inBand: boolean, airborne: boolean): number => {
      const world = duel(4);
      toWarn(world);
      run(world, HAZARD_WARN_TICKS);
      const s = world.state;
      const b = box(world);
      const ar = world.arena;
      s.x[0] = 600;
      s.y[0] = inBand ? b.y + 10 : b.y > ar.y + ar.h / 2 ? ar.y : ar.y + ar.h - (s.h[0] ?? 0);
      if (airborne) s.arcade[ARCADE_E * 0 + ArcadeE.dashUntil] = now(s) + 5;
      const dir = s.arcade[HZ(HazardF.dir)] ?? 0;
      const x0 = s.x[0];
      step(world, [0, 0]);
      return (s.x[0] - x0) * dir;
    };
    expect(nudge(false, false)).toBe(0);
    expect(nudge(true, false)).toBe(HAZARD_GUST_PX);
    // A dasher also moves by its own dash: compare against the same dash outside the band.
    expect(nudge(true, true) - nudge(false, true)).toBe(HAZARD_GUST_AIR_PX);
  });
});

describe('stage hazard lifetime', () => {
  it('a stage change ends a live hazard quietly', () => {
    const world = duel(1);
    toWarn(world);
    standIn(world, 0);
    world.state.arcade[AW(ArcadeW.stage)] = 3;
    const evs = run(world, HAZARD_WARN_TICKS);
    expect(hazardOf(world.state).kind).toBe(0);
    expect([K.hazardStrike, K.hazardHit].flatMap((k) => of(evs, k))).toHaveLength(0);
  });

  it('leaving the fight phase ends a live hazard, and the round reset clears the schedule but keeps the draw counter', () => {
    const world = duel(1);
    toWarn(world);
    const a = world.state.arcade;
    a[AW(ArcadeW.phase)] = RoundPhase.ko;
    run(world, 1);
    expect(hazardOf(world.state).kind).toBe(0);
    expect(a[HZ(HazardF.next)]).toBeGreaterThan(0);
    const gen = a[HZ(HazardF.gen)];
    expect(gen).toBe(1);
    clearHazard(world.state);
    expect(a[HZ(HazardF.next)]).toBe(0);
    expect(a[HZ(HazardF.gen)]).toBe(gen);
  });
});

describe('stage hazard determinism and view', () => {
  it('two runs of a seed hash the same; another seed draws differently', () => {
    const play = (seed: number): { h: number; x: number } => {
      const world = duel(1, seed);
      toWarn(world);
      const x = box(world).x;
      run(world, 200);
      return { h: hash(world.state), x };
    };
    expect(play(9)).toEqual(play(9));
    const xs = new Set([1, 2, 3, 4, 5, 6, 7, 8].map((seed) => play(seed).x));
    expect(xs.size).toBeGreaterThan(1);
  });

  it('a snapshot taken mid-hazard restores to the same future', () => {
    const world = duel(2);
    toWarn(world);
    run(world, HAZARD_WARN_TICKS + 20);
    const buf = createSnapshotBuf(world.state);
    snapshot(world.state, buf);
    run(world, 300);
    const h = hash(world.state);
    restore(world.state, buf);
    run(world, 300);
    expect(hash(world.state)).toBe(h);
  });

  it('the view shows the warning countdown, then the active hazard', () => {
    const world = duel(4);
    const view = createRenderView(world);
    expect(view.arcade()?.hazard).toEqual(new Array<number>(HAZARD_VIEW_STRIDE).fill(0));
    toWarn(world);
    const b = box(world);
    const dir = world.state.arcade[HZ(HazardF.dir)] ?? 0;
    const active = HAZARD_ACTIVE_TICKS[4] ?? 0;
    expect(view.arcade()?.hazard).toEqual([4, b.x, b.y, b.w, b.h, dir, HAZARD_WARN_TICKS - 1, HAZARD_WARN_TICKS - 1 + active]);
    run(world, HAZARD_WARN_TICKS);
    expect(view.arcade()?.hazard.slice(6)).toEqual([0, active - 1]);
  });
});
