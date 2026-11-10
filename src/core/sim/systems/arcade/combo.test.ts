import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  COMBO_SCALE_FLOOR_PM, COMBO_SCALE_PM, HIT_STUN_TICKS, HitStrength, JUGGLE_LIMIT, Q4_ONE, RecoveredReason,
  SUPER_COMBO_FLOOR_PM, comboScalePm, type HitStrengthValue,
} from '../../../data/arcade';
import { CHARACTERS } from '../../../data/characters';
import { characterId } from '../../../data/ids';
import { DEFAULT_SIM_FLAGS } from '../../../flags';
import { isFrozen, now } from '../../clock';
import { Cmd } from '../../commands';
import { EventSink, SimEventKind, type SimEvent } from '../../events';
import { hash } from '../../hash';
import { createMatch, type MatchSetup } from '../../match';
import { skipIntro } from './round-testkit';
import { createSnapshotBuf, restore, snapshot } from '../../snapshot';
import { ARCADE_E, ARCADE_T, ARCADE_TEAM_BASE, ArcadeE, ArcadeT, EntityFlag } from '../../state';
import { step } from '../../step';
import type { SimWorld } from '../../world';
import { ABILITY_DEFS } from '../projectile';
import { HIT_STRENGTH, applyArcadeHit } from './hit';
import { isStunned } from './stun';

const COMBO_HITS = ARCADE_TEAM_BASE + ArcadeT.comboHits;
const STUN_UNTIL = (id: number): number => id * ARCADE_E + ArcadeE.stunUntil;
const defOf = (slug: string): number => ABILITY_DEFS.findIndex((d) => d.id === slug);
const LIGHT = defOf('wind-cone');

function duel(attacker: string, victim: string): SimWorld {
  const setup: MatchSetup = {
    simVersion: 6, seed: 7, flags: { ...DEFAULT_SIM_FLAGS, rulesetArcade: true }, chapter: 1, difficulty: 1,
    p1: [{ character: characterId(attacker), xp: 1 }],
    p2: [{ character: characterId(victim), xp: 1 }],
  };
  const world = skipIntro(createMatch(setup));
  const s = world.state;
  s.x[0] = 500; s.y[0] = 300; s.x[1] = 580; s.y[1] = 300; s.dir[0] = 0;
  s.hp[1] = 10_000;
  return world;
}

/** Team 0's character hits id 1 with ability `defIdx` for `base`, straight through the hit path. */
function hit(world: SimWorld, sink: EventSink, defIdx = LIGHT, base = 10): SimEvent {
  applyArcadeHit(world, sink, 0, 0, 1, base, defIdx, 0);
  const ev = sink.events.filter((e) => e.kind === SimEventKind.hitConfirmed).at(-1);
  if (!ev) throw new Error('no hitConfirmed');
  return ev;
}

describe('combo scaling table (FUN-DESIGN 2.4)', () => {
  it('has the design numbers: 1000, 1000, 900, 800, 700, 600, then 500; supers keep 600', () => {
    expect(COMBO_SCALE_PM).toEqual([1000, 1000, 900, 800, 700, 600]);
    expect([COMBO_SCALE_FLOOR_PM, SUPER_COMBO_FLOOR_PM]).toEqual([500, 600]);
    const hits = [1, 2, 3, 4, 5, 6, 7, 8, 20];
    expect(hits.map((n) => comboScalePm(n, HitStrength.heavy))).toEqual([1000, 1000, 900, 800, 700, 600, 500, 500, 500]);
    expect(hits.map((n) => comboScalePm(n, HitStrength.super))).toEqual([1000, 1000, 900, 800, 700, 600, 600, 600, 600]);
  });
});

describe('combo counter', () => {
  it('counts hits on a stunned victim, scales their damage, and a hit on a free victim ends the combo and restarts', () => {
    const world = duel('sindarosa', 'rokcore');
    const s = world.state;
    const sink = new EventSink(0);
    const first = hit(world, sink);
    const raw = first['amount'] ?? 0;
    expect(first).toMatchObject({ combo: 1, scalePm: 1000, counter: 0 });
    const seen = [first];
    // Hits 2..7 land while stunned; the 7th is the juggle-cap hit (damage, no stun, `recovered` reason 1).
    for (let i = 2; i <= JUGGLE_LIMIT + 2; i++) seen.push(hit(world, sink));
    expect(seen.map((e) => e['combo'])).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(seen.map((e) => e['scalePm'])).toEqual([1000, 1000, 900, 800, 700, 600, 500]);
    for (const e of seen) expect(e['amount']).toBe((raw * (e['scalePm'] ?? 0)) / 1000);
    expect(sink.events.filter((e) => e.kind === SimEventKind.recovered).map((e) => e['reason'])).toEqual([1]);
    expect(isStunned(s, 1)).toBe(false);
    expect(s.arcade[COMBO_HITS]).toBe(7);

    const again = hit(world, sink);
    const ended = sink.events.filter((e) => e.kind === SimEventKind.comboEnded);
    const total = seen.reduce((sum, e) => sum + (e['amount'] ?? 0), 0);
    expect(ended).toHaveLength(1);
    expect(ended[0]).toMatchObject({ team: 0, hits: 7, damage: Math.round(total * Q4_ONE) / Q4_ONE });
    expect(sink.events.indexOf(ended[0] as SimEvent)).toBeLessThan(sink.events.indexOf(again));
    expect(again).toMatchObject({ combo: 1, scalePm: 1000 });
    expect(s.arcade[COMBO_HITS]).toBe(1);
  });

  it('ends with `recovered` (reason 0) then `comboEnded` on the first unfrozen tick whose game tick reaches the stun', () => {
    const world = duel('sindarosa', 'rokcore');
    const s = world.state;
    hit(world, new EventSink(0));
    hit(world, new EventSink(0));
    const until = s.arcade[STUN_UNTIL(1)] ?? 0;
    const at: [number, readonly SimEvent[]][] = [];
    for (let t = 0; t < 80; t++) {
      const g = now(s);
      const frozen = isFrozen(s);
      const evs = step(world, [0, 0]);
      if (evs.length > 0) at.push([g, evs]);
      if (frozen) expect(evs).toEqual([]);
    }
    expect(at).toHaveLength(1);
    const [g, evs] = at[0] ?? [-1, []];
    expect(g).toBe(until);
    expect(evs.map((e) => e.kind)).toEqual([SimEventKind.recovered, SimEventKind.comboEnded]);
    expect(evs[0]).toMatchObject({ id: 1, reason: RecoveredReason.stunEnded });
    expect(evs[1]).toMatchObject({ team: 0, hits: 2 });
    expect([s.arcade[COMBO_HITS], s.arcade[ARCADE_TEAM_BASE + ArcadeT.comboDamageQ4]]).toEqual([0, 0]);
  });

  it('a capped combo gives no reason-0 `recovered`, only `comboEnded`', () => {
    const world = duel('sindarosa', 'rokcore');
    const sink = new EventSink(0);
    for (let i = 1; i <= JUGGLE_LIMIT + 2; i++) hit(world, sink);
    const later: SimEvent[] = [];
    for (let t = 0; t < 60; t++) later.push(...step(world, [0, 0]));
    expect(later.map((e) => e.kind)).toEqual([SimEventKind.comboEnded]);
    expect(later[0]).toMatchObject({ team: 0, hits: JUGGLE_LIMIT + 2 });
  });
});

describe('counter hits', () => {
  it('a hit on a victim in its own cast recovery is a counter: one stun tier more', () => {
    const plain = duel('sindarosa', 'rokcore');
    expect(hit(plain, new EventSink(0))['counter']).toBe(0);
    expect(plain.state.arcade[STUN_UNTIL(1)]).toBe(HIT_STUN_TICKS[HitStrength.light]);

    const world = duel('sindarosa', 'rokcore');
    world.state.flags[1] = (world.state.flags[1] ?? 0) | EntityFlag.frozen;
    expect(HIT_STRENGTH[LIGHT]).toBe(HitStrength.light);
    expect(hit(world, new EventSink(0))).toMatchObject({ counter: 1, combo: 1, scalePm: 1000 });
    expect(world.state.arcade[STUN_UNTIL(1)]).toBe(HIT_STUN_TICKS[HitStrength.medium]);
  });

  it('Ground Shock recovery is counterable', () => {
    const world = duel('sindarosa', 'pax');
    step(world, [0, Cmd.secondary]); // Pax casts Ground Shock: 13 ticks of recovery
    expect((world.state.flags[1] ?? 0) & EntityFlag.frozen).not.toBe(0);
    expect(hit(world, new EventSink(0))['counter']).toBe(1);
  });
});

describe('combo properties', () => {
  const race = fc.constantFrom(...CHARACTERS.filter((c) => c.id !== 'eternal-void').map((c) => c.id));
  // No guard (arcade/guard.test.ts covers it): a held guard blocks, so combos would be rare.
  const cmd = fc.integer({ min: 0, max: 0x3fff }).map((c) => c & ~Cmd.guard);
  const sticky = fc
    .array(fc.tuple(fc.integer({ min: 1, max: 40 }), cmd, cmd), { minLength: 1, maxLength: 12 })
    .map((runs) => runs.flatMap(([k, p, q]) => Array.from({ length: k }, (): [number, number] => [p, q])));

  it('Arcade duels: combo indices run 1, 2, ..., scale by the table, end once with their length, never pass the cap', () => {
    let combos = 0;
    fc.assert(
      fc.property(race, race, sticky, fc.nat(), (a, b, inputs, cut) => {
        const play = (): number[] => {
          const world = duel(a, b);
          const s = world.state;
          const live = [0, 0];
          return inputs.map(([p, q]) => {
            for (const e of step(world, [p, q])) {
              if (e.kind === SimEventKind.hitConfirmed) {
                const team = 1 - (s.team[e['target'] ?? 0] ?? 0);
                const n = e['combo'] ?? 0;
                expect(n === 1 ? live[team] === 0 : n === (live[team] ?? 0) + 1).toBe(true);
                expect(e['scalePm']).toBe(comboScalePm(n, (e['strength'] ?? 0) as HitStrengthValue));
                expect(n).toBeLessThanOrEqual(JUGGLE_LIMIT + 2);
                live[team] = n;
              } else if (e.kind === SimEventKind.comboEnded) {
                const team = e['team'] ?? 0;
                expect(e['hits']).toBe(live[team]);
                live[team] = 0;
                combos++;
              }
            }
            expect([0, 1].map((t) => s.arcade[ARCADE_TEAM_BASE + t * ARCADE_T + ArcadeT.comboHits])).toEqual(live);
            return hash(s);
          });
        };
        const first = play();
        expect(play()).toEqual(first);
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
        expect(again).toEqual(first.slice(k));
      }),
      { numRuns: 30, seed: 0xc0b0 },
    );
    expect(combos).toBeGreaterThan(10);
  });
});
