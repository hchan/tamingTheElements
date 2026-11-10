import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { ARCADE_START_Y, arcadePlayfield, DASH_SPEED_MULT, WEATHER_TICKS, Weather } from '../../../data/arcade';
import { CHARACTER_HEIGHT, CHARACTER_WIDTH } from '../../../data/chapters';
import { CHARACTERS } from '../../../data/characters';
import { characterId } from '../../../data/ids';
import { DEFAULT_SIM_FLAGS } from '../../../flags';
import { computeDamage } from '../../../rules/damage';
import { arcadeRaceNumbers } from '../../arcade-numbers';
import {
  TERRAIN_AIR_PM, TERRAIN_CAP_PM, TERRAIN_COUNT_MIN, TERRAIN_FIRE_PM, TERRAIN_GAP, TERRAIN_SIDE_MIN, TERRAIN_SIDE_STEP,
  TERRAIN_SIDE_STEPS, TERRAIN_TELEGRAPH_TICKS, TERRAIN_WATER_EVERY, TERRAIN_WATER_HEAL_PM,
} from '../../arcade-numbers';
import { now } from '../../clock';
import { Cmd, inputMaskFor, type Command } from '../../commands';
import { EventSink, SimEventKind, type SimEvent } from '../../events';
import { hash } from '../../hash';
import { compareNumbers, compareStrings } from '../../../math/compare';
import { createMatch, P1_START_X, P2_START_X, type MatchSetup } from '../../match';
import { createSnapshotBuf, restore, snapshot } from '../../snapshot';
import {
  ARCADE_T, ARCADE_W, ARCADE_WORLD_BASE, ArcadeT, ArcadeW, cooldownIdx, countIdx, EntityFlag, EntityKind, MAX_ENTITIES,
  PATCH_MAX,
} from '../../state';
import { step } from '../../step';
import type { SimWorld } from '../../world';
import { applyArcadeHit } from './hit';
import { setKnockback } from './knockback';
import { chargedWeather, skipIntro } from './round-testkit';
import { onPatch, patchOver, stageOf, terrainDamagePm, terrainSpeedPm } from './terrain';
import { castTerrain } from './terrain-layout';

const PF = arcadePlayfield();
const AW = (f: number): number => ARCADE_WORLD_BASE + f;
const K = SimEventKind;
const IDLE: readonly [Command, Command] = [0, 0];
const FIRE = 1;
const WATER = 2;
const EARTH = 3;
const AIR = 4;
type Rect = readonly [x: number, y: number, w: number, h: number];

const of = (ev: readonly SimEvent[], kind: number): SimEvent[] => ev.filter((e) => e.kind === kind);

function setup(p1: readonly string[], p2: readonly string[], seed = 3, arcade = true): MatchSetup {
  return {
    simVersion: 21, seed, flags: { ...DEFAULT_SIM_FLAGS, rulesetArcade: arcade }, chapter: 1, difficulty: 1,
    p1: p1.map((c) => ({ character: characterId(c), xp: 1 })),
    p2: p2.map((c) => ({ character: characterId(c), xp: 1 })),
  };
}

/** Straight into the fight with no terrain yet (`skipIntro` bypasses the round start); p1 (id 0) at (300, 300), p2 (id 1) at (900, 300). */
function duel(p1 = 'sindarosa', p2 = 'curomo', seed = 3): SimWorld {
  const w = skipIntro(createMatch(setup([p1], [p2], seed)));
  const s = w.state;
  s.x[0] = 300; s.y[0] = 300; s.dir[0] = 0;
  s.x[1] = 900; s.y[1] = 300; s.dir[1] = 4;
  return w;
}

/** Sets the stage and its patches directly (a state edit outside `step`, like the other rule tests' placements). */
function terrain(w: SimWorld, stage: number, rects: readonly Rect[]): void {
  const a = w.state.arcade;
  a[AW(ArcadeW.stage)] = stage;
  a[AW(ArcadeW.patchCount)] = rects.length;
  rects.forEach((r, i) => {
    a.set(r, AW(ArcadeW.patches) + i * 4);
  });
}

/** The live patches of a world. */
function patches(w: SimWorld): Rect[] {
  const a = w.state.arcade;
  const p = AW(ArcadeW.patches);
  return Array.from({ length: a[AW(ArcadeW.patchCount)] ?? 0 }, (_, i) => [a[p + i * 4] ?? 0, a[p + i * 4 + 1] ?? 0, a[p + i * 4 + 2] ?? 0, a[p + i * 4 + 3] ?? 0] as const);
}

/** The x of character `id`. */
const px = (w: SimWorld, id: number): number => w.state.x[id] ?? 0;
const py = (w: SimWorld, id: number): number => w.state.y[id] ?? 0;

function run(w: SimWorld, n: number, cmds: readonly [Command, Command] = IDLE): SimEvent[] {
  const out: SimEvent[] = [];
  for (let i = 0; i < n; i++) out.push(...step(w, cmds));
  return out;
}

/** The layout a fresh match draws on its first tick (round 1 starts). */
function firstLayout(seed: number): { stage: number; rects: Rect[]; w: SimWorld } {
  const w = createMatch(setup(['sindarosa'], ['curomo'], seed));
  step(w, IDLE);
  return { stage: stageOf(w.state), rects: patches(w), w };
}

const gapOverlap = (a: Rect, b: Rect, gap: number): boolean =>
  a[0] < b[0] + b[2] + gap && b[0] - gap < a[0] + a[2] && a[1] < b[1] + b[3] + gap && b[1] - gap < a[1] + a[3];

describe('terrain data rows (FUN-DESIGN 2.15)', () => {
  it('have the owner-approved numbers', () => {
    expect([TERRAIN_FIRE_PM, TERRAIN_AIR_PM, TERRAIN_CAP_PM, TERRAIN_TELEGRAPH_TICKS]).toEqual([2000, 2000, 2500, 30]);
    expect([TERRAIN_WATER_HEAL_PM, TERRAIN_WATER_EVERY]).toEqual([10, 50]);
    expect([TERRAIN_COUNT_MIN, PATCH_MAX, TERRAIN_GAP]).toEqual([3, 5, CHARACTER_WIDTH]);
  });

  it('keeps the layout spawn spots equal to the match start spots', () => {
    const w = createMatch(setup(['sindarosa'], ['curomo']));
    expect([w.state.x[0], w.state.x[1]]).toEqual([P1_START_X, P2_START_X]);
    expect(P2_START_X).toBe(1280 - 160 - CHARACTER_WIDTH);
    expect(P1_START_X).toBe(160);
  });

  it('1 HP per 50 ticks is 10 pm of a 100 HP hero', () => {
    expect((100 * TERRAIN_WATER_HEAL_PM) / 1000).toBe(1);
  });
});

describe('layout (rule: 3 to 5 symmetric patches, inside the playfield, clear of walls, spawns and each other)', () => {
  const check = (seed: number): void => {
    const { stage, rects } = firstLayout(seed);
    expect(stage, `seed ${String(seed)}`).toBeGreaterThanOrEqual(1);
    expect(stage).toBeLessThanOrEqual(4);
    expect(rects.length).toBeGreaterThanOrEqual(TERRAIN_COUNT_MIN);
    expect(rects.length).toBeLessThanOrEqual(PATCH_MAX);
    const mirrored = rects.map(([x, y, w, h]) => [2 * PF.x + PF.w - x - w, 2 * PF.y + PF.h - y - h, w, h].join());
    expect(mirrored.sort(compareStrings)).toEqual(rects.map((r) => r.join()).sort(compareStrings));
    const spawns: Rect[] = [[P1_START_X, ARCADE_START_Y, CHARACTER_WIDTH, CHARACTER_HEIGHT], [P2_START_X, ARCADE_START_Y, CHARACTER_WIDTH, CHARACTER_HEIGHT]];
    rects.forEach((r, i) => {
      const [x, y, w, h] = r;
      expect(Number.isInteger(x) && Number.isInteger(y) && Number.isInteger(w) && Number.isInteger(h)).toBe(true);
      expect(w).toBeGreaterThanOrEqual(TERRAIN_SIDE_MIN);
      expect(w).toBeLessThanOrEqual(TERRAIN_SIDE_MIN + (TERRAIN_SIDE_STEPS - 1) * TERRAIN_SIDE_STEP);
      expect(x).toBeGreaterThanOrEqual(PF.x + TERRAIN_GAP);
      expect(x + w).toBeLessThanOrEqual(PF.x + PF.w - TERRAIN_GAP);
      expect(y).toBeGreaterThanOrEqual(PF.y + TERRAIN_GAP);
      expect(y + h).toBeLessThanOrEqual(PF.y + PF.h - TERRAIN_GAP);
      for (const sp of spawns) expect(gapOverlap(r, sp, TERRAIN_GAP)).toBe(false);
      rects.forEach((o, j) => {
        if (i !== j) expect(gapOverlap(r, o, TERRAIN_GAP)).toBe(false);
      });
    });
  };

  it('holds over many seeds (property)', () => {
    fc.assert(fc.property(fc.integer({ min: 0, max: 0xffffffff }), (seed) => {
        check(seed);
      }), { numRuns: 300, seed: 0x7e44 });
  });

  it('takes the stage from the seed: all four stages appear, the same seed gives the same stage and layout', () => {
    const stages = new Set<number>();
    for (let seed = 0; seed < 60; seed++) stages.add(firstLayout(seed).stage);
    expect([...stages].sort(compareNumbers)).toEqual([FIRE, WATER, EARTH, AIR]);
    const a = firstLayout(77);
    const b = firstLayout(77);
    expect(b.stage).toBe(a.stage);
    expect(b.rects).toEqual(a.rects);
    expect(hash(b.w.state)).toBe(hash(a.w.state));
  });

  it('emits terrainChanged {stage, count} on the round-start tick, and uses no sim stream (rng words unchanged)', () => {
    const w = createMatch(setup(['sindarosa'], ['curomo'], 9));
    const rng = Array.from(w.state.rng);
    const ev = step(w, IDLE);
    expect(of(ev, K.terrainChanged)).toMatchObject([{ stage: stageOf(w.state), count: patches(w).length }]);
    expect(Array.from(w.state.rng)).toEqual(rng);
  });

  it('is empty in Classic: no arcade block, no terrain events, no effect', () => {
    const w = createMatch(setup(['sindarosa'], ['curomo'], 9, false));
    expect(w.state.arcade.length).toBe(0);
    const ev = run(w, 200, [Cmd.right | Cmd.primary, Cmd.left | Cmd.secondary]);
    expect(ev.every((e) => e.kind < 40)).toBe(true);
    expect(stageOf(w.state)).toBe(0);
  });
});

describe('layout avoids what is on the field (rule: heroes inflated by hero size, projectiles in flight)', () => {
  it('a swap mid-fight keeps every patch clear of both heroes and a shot in flight', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 0xffff }), fc.integer({ min: 200, max: 1000 }), fc.integer({ min: 200, max: 480 }),
        fc.integer({ min: 300, max: 800 }), fc.integer({ min: 200, max: 480 }), (seed, x0, y0, bx, by) => {
          const w = duel('sindarosa', 'curomo', seed);
          const s = w.state;
          s.x[0] = x0; s.y[0] = y0;
          // A motionless shot (a bullet entity with no speed) so the layout has something to avoid.
          s.kind[2] = EntityKind.projectile; s.flags[2] = EntityFlag.alive; s.owner[2] = 0; s.team[2] = 0; s.x[2] = bx; s.y[2] = by; s.w[2] = 20; s.h[2] = 20;
          const sink = new EventSink(0);
          castTerrain(s, sink, WATER, now(s));
          run(w, TERRAIN_TELEGRAPH_TICKS + 2);
          expect(stageOf(s)).toBe(WATER);
          const boxes: Rect[] = [[px(w, 0), py(w, 0), 80, 80], [900, 300, 80, 80], [bx, by, 20, 20]];
          for (const p of patches(w)) for (const b of boxes) expect(gapOverlap(p, b, TERRAIN_GAP)).toBe(false);
        },
      ),
      { numRuns: 60, seed: 0x5afe },
    );
  });
});

describe('fire patch (rule: own-element hero deals x2, total modifier capped)', () => {
  /** Attacker 0 (`att`) hits defender 1 (`def`) for `base` damage; returns the damage amount. */
  const hit = (att: string, def: string, stage: number, inPatch: boolean, weather = 0): number => {
    const w = duel(att, def);
    terrain(w, stage, [inPatch ? [260, 260, 160, 160] : [700, 260, 160, 160]]);
    if (weather !== 0) {
      w.state.arcade[AW(ArcadeW.weather)] = weather;
      w.state.arcade[AW(ArcadeW.weatherUntil)] = now(w.state) + 100;
    }
    const sink = new EventSink(0);
    applyArcadeHit(w, sink, 0, 0, 1, 10, 0, 0);
    return of(sink.events, K.damage)[0]?.['amount'] ?? NaN;
  };
  const race = (slug: string): number => arcadeRaceNumbers(slug)[1];

  it('doubles the damage of a fire hero standing on a fire patch', () => {
    const base = hit('sindarosa', 'pax', FIRE, false);
    expect(hit('sindarosa', 'pax', FIRE, true)).toBe((base * TERRAIN_FIRE_PM) / 1000);
  });

  it('does nothing outside the patch, on another stage, or for another element', () => {
    const base = hit('sindarosa', 'pax', FIRE, false);
    expect(hit('sindarosa', 'pax', WATER, true)).toBe(base);
    expect(hit('sindarosa', 'pax', EARTH, true)).toBe(base);
    expect(hit('curomo', 'pax', FIRE, true)).toBe(hit('curomo', 'pax', FIRE, false));
    expect(hit('rokcore', 'pax', FIRE, true)).toBe(hit('rokcore', 'pax', FIRE, false));
  });

  it('caps the total of chart x weather x terrain at TERRAIN_CAP_PM of the plain hit', () => {
    // Fire against air (x1.25) under the sun (x1.2) on a fire patch (x2) would be x3.0: capped at x2.5.
    const w = duel('sindarosa', 'echo');
    const s = w.state;
    const plain = computeDamage({ base: 10, attackerMult: s.dmgMult[0] ?? 1, attEl: 'void', defEl: 'void', defReductionPct: 0 });
    const capped = hit('sindarosa', 'echo', FIRE, true, Weather.sun);
    const pm = race('sindarosa');
    expect(capped).toBeCloseTo(((plain * TERRAIN_CAP_PM) / 1000 * pm) / 1000, 9);
    // Without the weather it is x1.25 x2 = x2.5, exactly the cap: not cut.
    expect(hit('sindarosa', 'echo', FIRE, true)).toBeCloseTo(((plain * 2.5) * pm) / 1000, 9);
    // Fire against water (x0.8) on a patch is x1.6 of the plain hit, under the cap: the plain x2 of the chart-cut hit.
    expect(hit('sindarosa', 'curomo', FIRE, true)).toBe(hit('sindarosa', 'curomo', FIRE, false) * 2);
  });

  it('the hit path never lowers a modified hit below the chart and weather value', () => {
    for (const weather of [0, Weather.sun, Weather.rain, Weather.sandstorm, Weather.gale, Weather.eclipse]) {
      for (const def of ['pax', 'echo', 'curomo', 'rokcore']) {
        expect(hit('sindarosa', def, FIRE, true, weather)).toBeGreaterThanOrEqual(hit('sindarosa', def, FIRE, false, weather));
      }
    }
  });

  it('terrainDamagePm reads the attacker, not the victim', () => {
    const w = duel('sindarosa', 'sindarosa');
    terrain(w, FIRE, [[260, 260, 160, 160]]);
    expect([terrainDamagePm(w.state, 0), terrainDamagePm(w.state, 1)]).toEqual([2000, 1000]);
  });
});

describe('water patch (rule: a water hero heals TERRAIN_WATER_HEAL_PM of max HP every TERRAIN_WATER_EVERY game ticks)', () => {
  const lowHp = (w: SimWorld, id: number): void => {
    w.state.hp[id] = (w.state.maxHp[id] ?? 0) / 2;
  };

  it('heals the standing water hero by 10 pm of its max HP on every 50th game tick', () => {
    const w = duel('curomo', 'sindarosa');
    terrain(w, WATER, [[260, 260, 160, 160]]);
    lowHp(w, 0);
    const max = w.state.maxHp[0] ?? 0;
    const heals: SimEvent[] = [];
    let last = w.state.hp[0] ?? 0;
    for (let i = 0; i < 200; i++) {
      const ev = step(w, IDLE);
      heals.push(...of(ev, K.patchHeal));
      const hp = w.state.hp[0] ?? 0;
      if (of(ev, K.patchHeal).length === 0) expect(hp).toBe(last);
      last = hp;
    }
    expect(heals.length).toBe(4);
    expect(heals.map((e) => e.sourceId)).toEqual([0, 0, 0, 0]);
    for (const e of heals) expect(e['amount']).toBeCloseTo((max * TERRAIN_WATER_HEAL_PM) / 1000, 9);
    expect(w.state.hp[0]).toBeCloseTo(max / 2 + (4 * max * TERRAIN_WATER_HEAL_PM) / 1000, 9);
  });

  it('heals 1 HP per 50 ticks at the 100 HP reference', () => {
    const w = duel('curomo', 'sindarosa');
    terrain(w, WATER, [[260, 260, 160, 160]]);
    w.state.maxHp[0] = 100;
    w.state.hp[0] = 50;
    run(w, 50);
    expect(w.state.hp[0]).toBe(51);
  });

  it('never heals above max HP, off the patch, on another stage, a non-water hero, or in the intro', () => {
    const full = duel('curomo', 'sindarosa');
    terrain(full, WATER, [[260, 260, 160, 160]]);
    expect(of(run(full, 120), K.patchHeal)).toHaveLength(0);
    const near = duel('curomo', 'sindarosa');
    terrain(near, WATER, [[260, 260, 160, 160]]);
    near.state.hp[0] = (near.state.maxHp[0] ?? 0) - 0.001;
    run(near, 60);
    expect(near.state.hp[0]).toBe(near.state.maxHp[0]);
    for (const [stage, rect, att] of [[WATER, [700, 260, 160, 160], 'curomo'], [FIRE, [260, 260, 160, 160], 'curomo'], [WATER, [260, 260, 160, 160], 'sindarosa']] as const) {
      const w = duel(att, 'pax');
      terrain(w, stage, [rect]);
      lowHp(w, 0);
      const before = w.state.hp[0];
      expect(of(run(w, 120), K.patchHeal)).toHaveLength(0);
      expect(w.state.hp[0]).toBe(before);
    }
    const intro = createMatch(setup(['curomo'], ['sindarosa']));
    step(intro, IDLE);
    terrain(intro, WATER, [[P1_START_X - 40, 260, 160, 160]]);
    intro.state.hp[0] = (intro.state.maxHp[0] ?? 0) / 2;
    const e = run(intro, 60);
    expect(of(e, K.patchHeal)).toHaveLength(0);
  });
});

describe('earth patch (rule: a rock for the other elements; earth walks over; shots stop)', () => {
  const rock: Rect = [420, 220, 100, 240];

  it('clamps a non-earth hero like a wall: it stops at the rock and the move is `blocked`', () => {
    const w = duel('sindarosa', 'rokcore');
    terrain(w, EARTH, [rock]);
    const ev = run(w, 60, [Cmd.right, 0]);
    const x = px(w, 0);
    expect(x + CHARACTER_WIDTH).toBeLessThanOrEqual(rock[0]);
    expect(x + CHARACTER_WIDTH).toBeGreaterThan(rock[0] - 10);
    expect(of(ev, K.blocked).some((e) => e.sourceId === 0)).toBe(true);
    expect(w.state.y[0]).toBe(300);
  });

  it('lets an earth hero walk over it, with patchEntered and patchLeft', () => {
    const w = duel('sindarosa', 'rokcore');
    terrain(w, EARTH, [rock]);
    w.state.x[1] = 700;
    const ev = run(w, 80, [0, Cmd.left]);
    expect(w.state.x[1]).toBeLessThan(rock[0] - CHARACTER_WIDTH);
    expect(of(ev, K.patchEntered)).toMatchObject([{ team: 1, stage: EARTH, sourceId: 1 }]);
    expect(of(ev, K.patchLeft)).toMatchObject([{ team: 1, stage: EARTH }]);
    expect(of(ev, K.blocked).filter((e) => e.sourceId === 1)).toHaveLength(0);
  });

  it('lets a hero already inside a rock (a tag-in on the earth hero\'s spot) walk out, and never in again', () => {
    const w = duel('sindarosa', 'rokcore');
    terrain(w, EARTH, [rock]);
    w.state.x[0] = 440;
    run(w, 30, [Cmd.left, 0]);
    expect(w.state.x[0]).toBeLessThan(440);
    run(w, 60, [Cmd.left, 0]);
    expect(px(w, 0) + CHARACTER_WIDTH).toBeLessThanOrEqual(rock[0]);
    run(w, 60, [Cmd.right, 0]);
    expect(px(w, 0) + CHARACTER_WIDTH).toBeLessThanOrEqual(rock[0]);
  });

  it('stops a dash and a knockback at the rock', () => {
    const w = duel('sindarosa', 'rokcore');
    terrain(w, EARTH, [rock]);
    w.state.x[0] = 330;
    run(w, 20, [Cmd.right | Cmd.dash, 0]);
    expect(px(w, 0) + CHARACTER_WIDTH).toBeLessThanOrEqual(rock[0]);
    const k = duel('sindarosa', 'rokcore');
    terrain(k, EARTH, [rock]);
    k.state.x[0] = 330;
    setKnockback(k.state, 0, 224, 0);
    run(k, 30);
    expect(px(k, 0) + CHARACTER_WIDTH).toBeLessThanOrEqual(rock[0]);
  });

  it('removes a shot that reaches a rock, with projectileBlocked, and frees the cast count', () => {
    const w = duel('sindarosa', 'rokcore');
    terrain(w, EARTH, [[500, 200, 100, 300]]);
    const ev = run(w, 80, [Cmd.primary, 0]);
    const blocked = of(ev, K.projectileBlocked);
    expect(blocked.length).toBeGreaterThan(0);
    expect(blocked[0]?.['x']).toBeLessThan(600);
    expect(blocked[0]?.['x']).toBeGreaterThanOrEqual(400);
    expect(of(ev, K.damage)).toHaveLength(0);
    // Every blocked shot is gone and released its slot count: active shots are those still in flight.
    const flying = Array.from({ length: MAX_ENTITIES }, (_, i) => i).filter((i) => w.state.kind[i] === EntityKind.projectile && ((w.state.flags[i] ?? 0) & EntityFlag.alive) !== 0);
    expect(w.state.abil[countIdx(0, 0)]).toBe(flying.length);
    expect(w.state.abil[cooldownIdx(0, 0)]).toBeGreaterThan(0);
  });

  it('lets an earth hero\'s own shots pass over its rocks', () => {
    const w = duel('sindarosa', 'rokcore');
    terrain(w, EARTH, [[500, 200, 100, 300]]);
    const ev = run(w, 120, [0, Cmd.secondary]);
    expect(of(ev, K.projectileBlocked)).toHaveLength(0);
    expect(of(ev, K.damage).length).toBeGreaterThan(0);
  });

  it('does not stop shots or bodies on any other stage', () => {
    const w = duel('sindarosa', 'rokcore');
    terrain(w, FIRE, [[500, 200, 100, 300]]);
    const ev = run(w, 80, [Cmd.primary | Cmd.right, 0]);
    expect(of(ev, K.projectileBlocked)).toHaveLength(0);
    expect(w.state.x[0]).toBeGreaterThan(520);
  });
});

describe('air patch (rule: an air hero moves at x2; not stacked with a dash)', () => {
  const air: Rect = [200, 220, 400, 240];
  const stepDx = (att: string, rect: Rect, cmd: Command): number => {
    const w = duel(att, 'sindarosa');
    terrain(w, AIR, [rect]);
    const before = w.state.x[0] ?? 0;
    step(w, [cmd, 0]);
    return px(w, 0) - before;
  };

  it('doubles an air hero\'s walking step on the patch only', () => {
    const base = stepDx('echo', [900, 220, 100, 100], Cmd.right);
    expect(base).toBe(6);
    expect(stepDx('echo', air, Cmd.right)).toBe((base * TERRAIN_AIR_PM) / 1000);
    expect(stepDx('curomo', air, Cmd.right)).toBe(6);
    expect(stepDx('echo', air, Cmd.left)).toBe(-12);
  });

  it('keeps a dash at its own, larger speed (the larger applies, no stacking)', () => {
    const dx = (rect: Rect): number => {
      const w = duel('echo', 'sindarosa');
      terrain(w, AIR, [rect]);
      w.state.x[0] = 250;
      const x = px(w, 0);
      run(w, 4, [Cmd.right | Cmd.dash, 0]);
      return px(w, 0) - x;
    };
    expect(dx(air)).toBe(dx([900, 220, 100, 100]));
    expect(DASH_SPEED_MULT * 6).toBeGreaterThan((6 * TERRAIN_AIR_PM) / 1000);
  });

  it('caps the speed modifier at TERRAIN_CAP_PM', () => {
    expect(Math.min(TERRAIN_AIR_PM, TERRAIN_CAP_PM)).toBe(2000);
    const w = duel('echo', 'sindarosa');
    terrain(w, AIR, [air]);
    expect(terrainSpeedPm(w.state, 0)).toBe(2000);
    expect(terrainSpeedPm(w.state, 1)).toBe(1000);
  });
});

describe('weather swap (rule: a cast swaps the stage and patches after a 30 tick telegraph)', () => {
  /** Sindarosa (fire, id 0) casts the sun on game tick 0 of the fight; returns the events of the tick. */
  const cast = (w: SimWorld, team = 0): readonly SimEvent[] => {
    chargedWeather(w);
    return step(w, team === 0 ? [Cmd.weather, 0] : [0, Cmd.weather]);
  };

  it('telegraphs, then lands exactly TERRAIN_TELEGRAPH_TICKS game ticks after the cast with new patches', () => {
    const w = duel('sindarosa', 'curomo', 11);
    terrain(w, EARTH, [[420, 220, 100, 240]]);
    const ev = cast(w);
    expect(of(ev, K.terrainSwap)).toMatchObject([{ stage: FIRE, ticks: TERRAIN_TELEGRAPH_TICKS }]);
    const castAt = now(w.state) - 1;
    expect(stageOf(w.state)).toBe(EARTH);
    let landed = -1;
    for (let i = 0; i < 60 && landed < 0; i++) {
      const e = step(w, IDLE);
      if (of(e, K.terrainChanged).length > 0) landed = now(w.state) - 1;
      if (landed < 0) expect(stageOf(w.state)).toBe(EARTH);
    }
    expect(landed - castAt).toBe(TERRAIN_TELEGRAPH_TICKS);
    expect(stageOf(w.state)).toBe(FIRE);
    expect(patches(w)).not.toEqual([[420, 220, 100, 240]]);
    expect(patches(w).length).toBeGreaterThanOrEqual(1);
  });

  it('keeps the old stage and its effects during the telegraph (a rock is still a rock)', () => {
    const w = duel('sindarosa', 'rokcore');
    terrain(w, EARTH, [[420, 220, 100, 240]]);
    cast(w);
    run(w, TERRAIN_TELEGRAPH_TICKS - 5, [Cmd.right, 0]);
    expect(px(w, 0) + CHARACTER_WIDTH).toBeLessThanOrEqual(420);
  });

  it('swaps both the damage modifier and the terrain: the sun is fire weather and a fire stage', () => {
    const w = duel('sindarosa', 'curomo');
    terrain(w, WATER, [[420, 220, 100, 240]]);
    cast(w);
    expect(w.state.arcade[AW(ArcadeW.weather)]).toBe(Weather.sun);
    run(w, TERRAIN_TELEGRAPH_TICKS + 2);
    expect(stageOf(w.state)).toBe(FIRE);
  });

  it('maps each element\'s weather to its stage: sun fire, rain water, sandstorm earth, gale air', () => {
    const cases: readonly (readonly [string, number])[] = [['sindarosa', FIRE], ['curomo', WATER], ['rokcore', EARTH], ['echo', AIR]];
    for (const [race, stage] of cases) {
      const w = duel(race, 'pax');
      terrain(w, stage === FIRE ? WATER : FIRE, [[420, 220, 100, 240]]);
      cast(w);
      run(w, TERRAIN_TELEGRAPH_TICKS + 2);
      expect(stageOf(w.state), race).toBe(stage);
    }
  });

  it('recasting the same weather keeps the patches and starts no swap', () => {
    const w = duel('sindarosa', 'curomo');
    terrain(w, FIRE, [[420, 220, 100, 240]]);
    const ev = cast(w);
    expect(of(ev, K.terrainSwap)).toHaveLength(0);
    expect(of(run(w, 60), K.terrainChanged)).toHaveLength(0);
    expect(patches(w)).toEqual([[420, 220, 100, 240]]);
    expect(w.state.arcade[AW(ArcadeW.swapAt)]).toBe(0);
  });

  it('a cast back to the standing stage cancels a pending swap; a second cast of the pending one keeps its timer', () => {
    const w = duel('sindarosa', 'curomo');
    terrain(w, FIRE, [[420, 220, 100, 240]]);
    step(w, IDLE);
    const sink = new EventSink(0);
    const g = now(w.state);
    castTerrain(w.state, sink, WATER, g);
    const at = w.state.arcade[AW(ArcadeW.swapAt)];
    expect(at).toBe(g + TERRAIN_TELEGRAPH_TICKS);
    castTerrain(w.state, sink, WATER, g + 10);
    expect(w.state.arcade[AW(ArcadeW.swapAt)]).toBe(at);
    expect(of(sink.events, K.terrainSwap)).toHaveLength(1);
    castTerrain(w.state, sink, FIRE, g + 12);
    expect(w.state.arcade[AW(ArcadeW.swapAt)]).toBe(0);
    run(w, 60);
    expect(stageOf(w.state)).toBe(FIRE);
    expect(patches(w)).toEqual([[420, 220, 100, 240]]);
  });

  it('a second weather during the telegraph retargets the swap to the later one', () => {
    const w = duel('sindarosa', 'curomo');
    terrain(w, EARTH, [[420, 220, 100, 240]]);
    chargedWeather(w);
    step(w, [Cmd.weather, Cmd.weather]);
    run(w, TERRAIN_TELEGRAPH_TICKS + 2);
    // Team 1 (water) cast after team 0 (fire) in the same tick: the later cast wins.
    expect(stageOf(w.state)).toBe(WATER);
  });

  it('eclipse has no terrain: no swap, patches kept', () => {
    const w = duel('eternal-void', 'curomo');
    terrain(w, EARTH, [[420, 220, 100, 240]]);
    const ev = cast(w);
    expect(of(ev, K.weatherChanged)).toMatchObject([{ weather: Weather.eclipse }]);
    expect(of(ev, K.terrainSwap)).toHaveLength(0);
    run(w, 60);
    expect(stageOf(w.state)).toBe(EARTH);
    expect(patches(w)).toEqual([[420, 220, 100, 240]]);
  });

  it('a weather that ends keeps the last stage and patches', () => {
    const w = duel('sindarosa', 'curomo');
    terrain(w, WATER, [[420, 220, 100, 240]]);
    cast(w);
    const ev = run(w, WEATHER_TICKS + 20);
    expect(of(ev, K.weatherEnded)).toHaveLength(1);
    expect(stageOf(w.state)).toBe(FIRE);
    expect(patches(w).length).toBeGreaterThan(0);
    const kept = patches(w);
    run(w, 100);
    expect(patches(w)).toEqual(kept);
  });
});

describe('rounds and tag (rule: patches redrawn each round; the active hero\'s element decides)', () => {
  it('draws a new layout at every round start and keeps the stage', () => {
    const w = createMatch(setup(['sindarosa'], ['pax'], 5));
    const first: Rect[][] = [];
    const rounds: number[] = [];
    // Round 1: team 0 wins, round 2: team 1, so round 3 is played.
    for (let i = 0; i < 20_000 && rounds.length < 3; i++) {
      const ev = step(w, IDLE);
      if (of(ev, K.fight).length > 0 && w.state.arcade[AW(ArcadeW.round)] !== rounds[rounds.length - 1]) {
        rounds.push(w.state.arcade[AW(ArcadeW.round)] ?? 0);
        first.push(patches(w));
        // KO team 1 so the next round starts.
        for (let id = 0; id < MAX_ENTITIES; id++) if (w.state.kind[id] === EntityKind.character && w.state.team[id] === rounds.length % 2) w.state.hp[id] = 0;
      }
    }
    expect(rounds).toEqual([1, 2, 3]);
    const stage = stageOf(w.state);
    expect(stage).toBeGreaterThan(0);
    expect(w.state.arcade[AW(ArcadeW.terrainGen)]).toBe(3);
    expect(new Set(first.map((r) => r.join())).size).toBe(3);
    for (const r of first) expect(r.length).toBeGreaterThanOrEqual(TERRAIN_COUNT_MIN);
  });

  it('a pending swap lands at the round start', () => {
    const w = createMatch(setup(['sindarosa'], ['pax'], 5));
    step(w, IDLE);
    const sink = new EventSink(0);
    const target = stageOf(w.state) === WATER ? AIR : WATER;
    castTerrain(w.state, sink, target, now(w.state));
    for (let id = 0; id < MAX_ENTITIES; id++) if (w.state.kind[id] === EntityKind.character && w.state.team[id] === 1) w.state.hp[id] = 0;
    for (let i = 0; i < 2000 && w.state.arcade[AW(ArcadeW.round)] !== 2; i++) step(w, IDLE);
    expect(w.state.arcade[AW(ArcadeW.round)]).toBe(2);
    expect(stageOf(w.state)).toBe(target);
    expect(w.state.arcade[AW(ArcadeW.swapAt)]).toBe(0);
  });

  it('the controlled hero\'s element decides: a tag from an earth hero on a rock to a fire hero changes the rule', () => {
    const w = skipIntro(createMatch(setup(['rokcore', 'sindarosa'], ['pax'])));
    const s = w.state;
    s.x[0] = 450; s.y[0] = 300; s.x[2] = 900; s.y[2] = 300;
    terrain(w, EARTH, [[420, 220, 100, 240]]);
    step(w, IDLE);
    expect(onPatch(s, 0)).toBe(true);
    for (let i = 0; i < 5; i++) step(w, [Cmd.swap1, 0]);
    // Sindarosa (id 1, fire) is in at the earth hero's spot, inside the rock: it walks out freely, never back in.
    expect(onPatch(s, 1)).toBe(false);
    expect((s.flags[1] ?? 0) & EntityFlag.benched).toBe(0);
    run(w, 40, [Cmd.left, 0]);
    expect((s.x[1] ?? 0) + CHARACTER_WIDTH).toBeLessThanOrEqual(420);
    run(w, 40, [Cmd.right, 0]);
    expect((s.x[1] ?? 0) + CHARACTER_WIDTH).toBeLessThanOrEqual(420);
  });
});

describe('patchOver and onPatch', () => {
  it('uses the interior: a touching edge or a point on the border is outside', () => {
    const w = duel();
    terrain(w, FIRE, [[400, 300, 100, 100]]);
    const s = w.state;
    expect(patchOver(s, 400, 300, 0, 0)).toBe(-1);
    expect(patchOver(s, 401, 301, 0, 0)).toBe(0);
    expect(patchOver(s, 320, 300, 80, 80)).toBe(-1);
    expect(patchOver(s, 321, 300, 80, 80)).toBe(0);
    expect(patchOver(s, 499, 399, 0, 0)).toBe(0);
    expect(patchOver(s, 500, 399, 0, 0)).toBe(-1);
  });

  it('is the hero centre that counts', () => {
    const w = duel('sindarosa');
    terrain(w, FIRE, [[400, 300, 100, 100]]);
    const s = w.state;
    s.x[0] = 361; s.y[0] = 300;
    expect(onPatch(s, 0)).toBe(true);
    s.x[0] = 360;
    expect(onPatch(s, 0)).toBe(false);
  });
});

describe('determinism', () => {
  const cmdArb = fc.integer({ min: 0, max: inputMaskFor({ rulesetArcade: true }) });
  const inputsArb = fc.array(fc.tuple(cmdArb, cmdArb), { minLength: 150, maxLength: 150 });
  const duelOf = (seed: number, a: string, b: string): SimWorld => createMatch(setup([a, b], [b, a], seed));
  const RACES = ['sindarosa', 'curomo', 'rokcore', 'echo', 'eternal-void'];

  it('replays and snapshots match; no non-earth hero ever walks into a rock; layouts stay symmetric (property)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 0xffff }), fc.constantFrom(...RACES), fc.constantFrom(...RACES), inputsArb, fc.integer({ min: 0, max: 149 }), (seed, a, b, inputs, cut) => {
        const run1 = duelOf(seed, a, b);
        const run2 = duelOf(seed, a, b);
        const buf = createSnapshotBuf(run2.state);
        const hashes: number[] = [];
        let was: boolean[] = [];
        inputs.forEach(([p, q], i) => {
          // Make weather easy to cast in the fight so swaps happen.
          chargedWeather(run1);
          chargedWeather(run2);
          const cmds = [p | (i % 7 === 0 ? Cmd.weather : 0), q] as const;
          const ev = step(run1, cmds);
          hashes.push(hash(run1.state));
          step(run2, cmds);
          if (i === cut) snapshot(run2.state, buf);
          const s = run1.state;
          expect(patches(run1).length).toBeLessThanOrEqual(PATCH_MAX);
          const inside: boolean[] = [];
          for (let id = 0; id < MAX_ENTITIES; id++) {
            const live = s.kind[id] === EntityKind.character && ((s.flags[id] ?? 0) & (EntityFlag.alive | EntityFlag.benched)) === EntityFlag.alive;
            const earth = CHARACTERS[s.defId[id] ?? 0]?.element === 'earth';
            inside[id] = stageOf(s) === EARTH && live && !earth && patchOver(s, s.x[id] ?? 0, s.y[id] ?? 0, 80, 80) >= 0;
            // A non-earth hero is never moved into a rock: it is in one only if it was already (a tag-in or a swap that landed).
            if (inside[id] && !was[id] && of(ev, K.tagIn).length === 0 && of(ev, K.terrainChanged).length === 0) throw new Error(`hero ${String(id)} entered a rock at step ${String(i)}`);
          }
          was = inside;
        });
        expect(hash(run2.state)).toBe(hashes[inputs.length - 1]);
        restore(run2.state, buf);
        for (let i = cut + 1; i < inputs.length; i++) {
          const [p, q] = inputs[i] ?? [0, 0];
          chargedWeather(run2);
          step(run2, [p | (i % 7 === 0 ? Cmd.weather : 0), q]);
          expect(hash(run2.state)).toBe(hashes[i]);
        }
      }),
      { numRuns: 20, seed: 0x7e44 },
    );
  });

  it('the terrain slots end the Arcade world block', () => {
    expect(ArcadeW.patches + PATCH_MAX * 4).toBe(ARCADE_W);
    expect(ArcadeT.inPatch).toBe(ARCADE_T - 1);
  });
});
