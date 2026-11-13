import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  HEAVY_MIN_DAMAGE, HIT_STOP_TICKS, HitStopCause, HitStrength, KO_HIT_STOP_TICKS, MEDIUM_MIN_DAMAGE,
  PARRY_HIT_STOP_TICKS, hitStrengthFor,
} from '../../../data/arcade';
import { CHARACTERS } from '../../../data/characters';
import { sizeDamagePm, sizeOfSlug } from '../../../data/size';
import { arcadeRaceNumbers } from '../../arcade-numbers';
import { characterId } from '../../../data/ids';
import { DEFAULT_SIM_FLAGS } from '../../../flags';
import { isFrozen, now } from '../../clock';
import { Cmd } from '../../commands';
import { EventSink, SimEventKind, type SimEvent } from '../../events';
import { hash } from '../../hash';
import { createMatch, type MatchSetup } from '../../match';
import { skipIntro } from './round-testkit';
import { createSnapshotBuf, restore, snapshot } from '../../snapshot';
import { ARCADE_WORLD_BASE, ArcadeW, cooldownIdx, World as W } from '../../state';
import { step } from '../../step';
import type { SimWorld } from '../../world';
import { ABILITY_DEFS } from '../projectile';
import { HIT_STRENGTH, hitStop } from './hit';

const FREEZE_UNTIL = ARCADE_WORLD_BASE + ArcadeW.freezeUntil;
const FREEZE_KIND = ARCADE_WORLD_BASE + ArcadeW.freezeKind;
const strengthOf = (slug: string): number => HIT_STRENGTH[ABILITY_DEFS.findIndex((d) => d.id === slug)] ?? -1;

/** Two fighters 80 px apart on one row, the attacker (id 0) facing east at the victim (id 1). */
function duel(attacker: string, victim: string, arcade = true): SimWorld {
  const setup: MatchSetup = {
    simVersion: 4, seed: 7, flags: { ...DEFAULT_SIM_FLAGS, rulesetArcade: arcade }, chapter: 1, difficulty: 1,
    p1: [{ character: characterId(attacker), xp: 1 }],
    p2: [{ character: characterId(victim), xp: 1 }],
  };
  const world = skipIntro(createMatch(setup));
  const s = world.state;
  s.x[0] = 500; s.y[0] = 300; s.x[1] = 580; s.y[1] = 300; s.dir[0] = 0;
  s.hp[1] = 10_000;
  return world;
}

/** Holds `cmd` for team 0 until the first hit; returns that step's events. */
function firstHit(world: SimWorld, cmd: number): readonly SimEvent[] {
  for (let t = 0; t < 60; t++) {
    const evs = step(world, [cmd, 0]);
    if (evs.some((e) => e.kind === SimEventKind.damage)) return evs;
  }
  throw new Error('no hit in 60 ticks');
}

/** Steps (holding `cmd`) while frozen; returns how many steps were frozen. Each frozen step must be silent. */
function drain(world: SimWorld, cmd: number): number {
  let n = 0;
  while (isFrozen(world.state)) {
    expect(step(world, [cmd, cmd])).toEqual([]);
    n++;
  }
  return n;
}

describe('hit strength (FUN-DESIGN 2.2)', () => {
  it('comes from the level-0 base damage: light under 15, medium 15-29, heavy 30+; melee one tier more, capped', () => {
    expect([MEDIUM_MIN_DAMAGE, HEAVY_MIN_DAMAGE]).toEqual([15, 30]);
    expect([0, 14, 15, 29, 30, 140].map((d) => hitStrengthFor('x', d, false))).toEqual([0, 0, 1, 1, 2, 2]);
    expect([0, 14, 15, 29, 30].map((d) => hitStrengthFor('x', d, true))).toEqual([1, 1, 2, 2, 2]);
  });

  it('per ability, with the Hurricane override', () => {
    const want: Record<string, number> = {
      'wind-cone': HitStrength.light, tornado: HitStrength.light, fireball: HitStrength.medium,
      'rock-pellet': HitStrength.medium, 'fire-blast': HitStrength.heavy, 'chaos-orb': HitStrength.heavy,
      'steal-health': HitStrength.medium, 'ice-shock': HitStrength.heavy, 'ground-shock': HitStrength.heavy,
      hurricane: HitStrength.light,
    };
    for (const [slug, s] of Object.entries(want)) expect([slug, strengthOf(slug)]).toEqual([slug, s]);
    expect(HIT_STRENGTH).toHaveLength(ABILITY_DEFS.length);
  });

  it('hit-stop lengths: light 4, medium 6, heavy 8, super 10, parry 10, KO 30', () => {
    expect(HIT_STOP_TICKS).toEqual([4, 6, 8, 10]);
    expect([PARRY_HIT_STOP_TICKS, KO_HIT_STOP_TICKS]).toEqual([10, 30]);
  });
});

describe('hit-stop', () => {
  const cases = [
    ['cyclonius', Cmd.secondary, 'wind-cone', 4],
    ['fiara', Cmd.secondary, 'fireball', 6],
    ['sindarosa', Cmd.primary, 'fire-blast', 8],
    ['wispera', Cmd.secondary, 'steal-health', 6],
    ['pax', Cmd.secondary, 'ground-shock', 8],
  ] as const;
  for (const [race, cmd, slug, n] of cases) {
    it(`${slug} freezes the next ${String(n)} ticks, then the game clock resumes`, () => {
      const world = duel(race, 'rokcore');
      const evs = firstHit(world, cmd);
      const tick = evs[0]?.tick ?? 0;
      const hit = evs.find((e) => e.kind === SimEventKind.hitConfirmed);
      expect(hit).toMatchObject({ target: 1, attacker: 0, strength: strengthOf(slug), scalePm: 1000, combo: 1 });
      expect(ABILITY_DEFS[hit?.['ability'] ?? -1]?.id).toBe(slug);
      expect(evs.find((e) => e.kind === SimEventKind.hitStop)).toMatchObject({ ticks: n, cause: HitStopCause.hit });
      expect(world.state.arcade[FREEZE_UNTIL]).toBe(tick + 1 + n);
      const game = now(world.state);
      const hp = world.state.hp[1];
      expect(drain(world, cmd)).toBe(n);
      expect([now(world.state), world.state.hp[1]]).toEqual([game, hp]);
      step(world, [0, 0]);
      expect(now(world.state)).toBe(game + 1);
    });
  }

  it('a KO hit freezes 30 ticks with cause KO; a later hit on the emptied victim in the same tick is not a KO', () => {
    const world = duel('sindarosa', 'rokcore');
    world.state.hp[1] = 1;
    const evs = firstHit(world, Cmd.primary);
    expect(evs.find((e) => e.kind === SimEventKind.hitStop)).toMatchObject({ ticks: 30, cause: HitStopCause.ko });
    expect(world.state.arcade[FREEZE_KIND]).toBe(HitStopCause.ko);
    expect(evs.some((e) => e.kind === SimEventKind.died)).toBe(true);
    expect(drain(world, 0)).toBe(30);
  });

  it('takes the max of overlapping hit-stops, never the sum, and never shortens a longer freeze', () => {
    const world = duel('sindarosa', 'rokcore');
    const s = world.state;
    s.world[W.tick] = 100;
    const sink = new EventSink(100);
    hitStop(world, sink, 0, 4, HitStopCause.hit);
    expect(s.arcade[FREEZE_UNTIL]).toBe(105);
    hitStop(world, sink, 0, 30, HitStopCause.ko);
    hitStop(world, sink, 0, 8, HitStopCause.hit);
    expect([s.arcade[FREEZE_UNTIL], s.arcade[FREEZE_KIND]]).toEqual([131, HitStopCause.ko]);
    expect(sink.events.map((e) => [e.kind, e['ticks'], e['cause'], e.seq])).toEqual([
      [40, 4, 0, 0], [40, 30, 3, 1], [40, 8, 0, 2],
    ]);
  });

  it('cooldowns do not elapse while frozen: casts are cooldown + 1 game ticks apart, plus the freezes in W.tick', () => {
    const world = duel('sindarosa', 'rokcore');
    const s = world.state;
    const cd = (ABILITY_DEFS.find((d) => d.id === 'fire-blast')?.cooldownTicks ?? 0) + 1;
    const casts: [number, number][] = [];
    let ready = s.abil[cooldownIdx(0, 0)] ?? 0;
    for (let t = 0; t < 200; t++) {
      const [tick, game] = [s.world[W.tick] ?? 0, now(s)];
      s.x[1] = 580; // pinned: knockback would carry the victim out of reach before the next cast
      step(world, [Cmd.primary, 0]);
      if ((s.abil[cooldownIdx(0, 0)] ?? 0) !== ready) {
        ready = s.abil[cooldownIdx(0, 0)] ?? 0;
        casts.push([tick, game]);
      }
    }
    expect(casts.length).toBeGreaterThan(3);
    for (let i = 1; i < casts.length; i++) {
      const [[t0, g0], [t1, g1]] = [casts[i - 1] ?? [0, 0], casts[i] ?? [0, 0]];
      expect([g1 - g0, t1 - t0]).toEqual([cd, cd + 8]);
    }
  });

  it('events keep unique ids (W.tick) while the game clock stands still', () => {
    const world = duel('pax', 'sindarosa');
    world.state.hp[0] = 10_000;
    const ids = new Set<string>();
    let hits = 0;
    for (let t = 0; t < 600; t++) {
      world.state.x[1] = 580; // pinned in reach of Ground Shock despite knockback; it still walks (moved events)
      for (const e of step(world, [Cmd.secondary, Cmd.primary | (t % 40 < 20 ? Cmd.left : Cmd.right)])) {
        const id = `${String(e.tick)}/${String(e.sourceId)}/${String(e.kind)}/${String(e.seq)}`;
        expect(ids.has(id)).toBe(false);
        ids.add(id);
        if (e.kind === SimEventKind.hitConfirmed) hits++;
      }
    }
    expect(hits).toBeGreaterThan(4);
    expect(now(world.state)).toBeLessThan(world.state.world[W.tick] ?? 0);
  });

  it('scales an ability hit by the attacker race damagePm (FUN-DESIGN 2.13); Classic keeps the legacy amount', () => {
    for (const [race, cmd] of [['sindarosa', Cmd.primary], ['pax', Cmd.secondary], ['ishimi', Cmd.secondary]] as const) {
      // The first HP drop (Classic melee emits no event, so read the HP).
      const amount = (arcade: boolean): number => {
        const world = duel(race, 'rokcore', arcade);
        for (let t = 0; t < 60 && world.state.hp[1] === 10_000; t++) step(world, [cmd, 0]);
        return 10_000 - (world.state.hp[1] ?? 0);
      };
      const classic = amount(false);
      expect(classic, race).toBeGreaterThan(0);
      expect(amount(true), race).toBeCloseTo((classic * arcadeRaceNumbers(race)[1] * sizeDamagePm(sizeOfSlug(race))) / 1_000_000, 9);
    }
  });

  it('Classic is untouched: melee emits nothing, projectiles only `damage`, and the clock never freezes', () => {
    for (const [race, cmd] of [['pax', Cmd.secondary], ['sindarosa', Cmd.primary]] as const) {
      const world = duel(race, 'rokcore', false);
      const kinds: number[] = [];
      for (let t = 0; t < 120; t++) {
        kinds.push(...step(world, [cmd, 0]).map((e) => e.kind));
        expect([isFrozen(world.state), now(world.state)]).toEqual([false, world.state.world[W.tick]]);
      }
      expect(world.state.hp[1]).toBeLessThan(10_000);
      expect(kinds.every((k) => k === SimEventKind.damage)).toBe(true);
      expect(kinds.length > 0).toBe(race === 'sindarosa');
    }
  });
});

describe('hit-stop properties', () => {
  const race = fc.constantFrom(...CHARACTERS.filter((c) => c.id !== 'eternal-void').map((c) => c.id));
  // No dash or guard bit: dashes (dash.test.ts) and guards (guard.test.ts) would dodge or block most of the hits.
  const cmd = fc.integer({ min: 0, max: 0x3fff }).map((c) => c & ~(Cmd.dash | Cmd.guard));
  const sticky = fc
    .array(fc.tuple(fc.integer({ min: 1, max: 40 }), cmd, cmd), { minLength: 1, maxLength: 12 })
    .map((runs) => runs.flatMap(([k, p, q]) => Array.from({ length: k }, (): [number, number] => [p, q])));

  it('Arcade duels re-simulate to identical hashes and events, also after a snapshot restore mid-run', () => {
    let hits = 0;
    fc.assert(
      fc.property(race, race, sticky, fc.nat(), (a, b, inputs, cut) => {
        const play = (): { world: SimWorld; hashes: number[]; events: SimEvent[] } => {
          const world = duel(a, b);
          const events: SimEvent[] = [];
          const hashes = inputs.map(([p, q]) => {
            events.push(...step(world, [p, q]));
            return hash(world.state);
          });
          return { world, hashes, events };
        };
        const first = play();
        expect(play()).toEqual(first);
        hits += first.events.filter((e) => e.kind === SimEventKind.hitConfirmed).length;
        // Every hit stops the clock for its strength (or the KO length), and the freeze never outlasts 30 ticks.
        for (const [i, e] of first.events.entries()) {
          if (e.kind !== SimEventKind.hitConfirmed) continue;
          const stop = first.events[i + 1];
          expect(stop?.kind).toBe(SimEventKind.hitStop);
          expect([HIT_STOP_TICKS[e['strength'] as 0 | 1 | 2], KO_HIT_STOP_TICKS]).toContain(stop?.['ticks']);
        }
        const k = cut % inputs.length;
        const world = duel(a, b);
        for (const [p, q] of inputs.slice(0, k)) step(world, [p, q]);
        const buf = createSnapshotBuf(world.state);
        snapshot(world.state, buf);
        for (const [p, q] of inputs.slice(k)) step(world, [p, q]);
        restore(world.state, buf);
        const again = inputs.slice(k).map(([p, q]) => {
          step(world, [p, q]);
          return hash(world.state);
        });
        expect(again).toEqual(first.hashes.slice(k));
      }),
      { numRuns: 40, seed: 0x5709 },
    );
    expect(hits).toBeGreaterThan(30);
  });
});
