import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  COMBO_STUN_CAP_TICKS, FREEZE_STUN_TICKS, HIT_STUN_TICKS, HitStrength, JUGGLE_LIMIT, JUGGLE_STUN_STEP, KNOCKBACK_DECAY_Q4,
  KNOCKBACK_Q4, MIN_HIT_STUN_TICKS, RECOVERY_INVULN_TICKS, RecoveredReason,
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
import {
  ARCADE_E, ARCADE_WORLD_BASE, ArcadeE, ArcadeW, EntityFlag, MAX_ENTITIES, STATUS_SLOTS, STATUS_STRIDE, cooldownIdx,
} from '../../state';
import { step } from '../../step';
import type { SimWorld } from '../../world';
import { ABILITY_DEFS } from '../projectile';
import { HIT_STUN } from './hit';
import { setKnockback } from './knockback';
import { applyStun, canAct, isInvulnerable, isStunned } from './stun';

const GAME_TICK = ARCADE_WORLD_BASE + ArcadeW.gameTick;
const E = (id: number, f: number): number => id * ARCADE_E + f;
const EAST = 0;
const NORTH = 2;
const WEST = 4;

/** Two fighters 80 px apart on one row, the attacker (id 0) facing east at the victim (id 1). */
function duel(attacker: string, victim: string, arcade = true): SimWorld {
  const setup: MatchSetup = {
    simVersion: 5, seed: 7, flags: { ...DEFAULT_SIM_FLAGS, rulesetArcade: arcade }, chapter: 1, difficulty: 1,
    p1: [{ character: characterId(attacker), xp: 1 }],
    p2: [{ character: characterId(victim), xp: 1 }],
  };
  const world = skipIntro(createMatch(setup));
  const s = world.state;
  s.x[0] = 500; s.y[0] = 300; s.x[1] = 580; s.y[1] = 300; s.dir[0] = EAST;
  s.hp[1] = 10_000;
  return world;
}

/** Holds `cmd` for team 0 until its first `hitConfirmed`; returns [game tick of the hit, its events]. */
function firstHit(world: SimWorld, cmd: number): [number, readonly SimEvent[]] {
  for (let t = 0; t < 120; t++) {
    const game = now(world.state);
    const evs = step(world, [cmd, 0]);
    if (evs.some((e) => e.kind === SimEventKind.hitConfirmed)) return [game, evs];
  }
  throw new Error('no hit in 120 ticks');
}

/** Steps with idle commands until the victim's knockback is spent; returns how far it travelled in x and y. */
function slide(world: SimWorld, id = 1): [number, number] {
  const s = world.state;
  const [x0, y0] = [s.x[id] ?? 0, s.y[id] ?? 0];
  for (let t = 0; t < 100 && ((s.arcade[E(id, ArcadeE.kbVx)] ?? 0) !== 0 || (s.arcade[E(id, ArcadeE.kbVy)] ?? 0) !== 0); t++) {
    step(world, [0, 0]);
  }
  return [(s.x[id] ?? 0) - x0, (s.y[id] ?? 0) - y0];
}

const slug = (i: number): string => ABILITY_DEFS[i]?.id ?? '';
const stunOf = (id: string): number => HIT_STUN[ABILITY_DEFS.findIndex((d) => d.id === id)] ?? -1;

describe('stun and knockback tables (FUN-DESIGN 2.3)', () => {
  it('has the design numbers', () => {
    expect(HIT_STUN_TICKS).toEqual([32, 38, 44, 48]);
    expect([JUGGLE_STUN_STEP, MIN_HIT_STUN_TICKS, JUGGLE_LIMIT]).toEqual([2, 6, 5]);
    expect([COMBO_STUN_CAP_TICKS, RECOVERY_INVULN_TICKS, FREEZE_STUN_TICKS]).toEqual([150, 20, 60]);
    expect(KNOCKBACK_Q4).toEqual([96, 144, 224, 256]);
    expect(KNOCKBACK_DECAY_Q4).toBe(16);
    expect([RecoveredReason.stunEnded, RecoveredReason.juggleCap, RecoveredReason.stunCap]).toEqual([0, 1, 2]);
  });

  it('per ability: stun by strength, Tornado and Entangling Vines 60', () => {
    expect(HIT_STUN).toHaveLength(ABILITY_DEFS.length);
    const want: Record<string, number> = {
      'wind-cone': 32, fireball: 38, 'fire-blast': 44, 'ground-shock': 44, hurricane: 32, tornado: 60,
      'entangling-vines': 60,
    };
    for (const [id, n] of Object.entries(want)) expect([id, stunOf(id)]).toEqual([id, n]);
  });
});

describe('hit-stun', () => {
  const cases = [
    ['cyclonius', Cmd.secondary, 'wind-cone', 32],
    ['fiara', Cmd.secondary, 'fireball', 38],
    ['sindarosa', Cmd.primary, 'fire-blast', 44],
    ['pax', Cmd.secondary, 'ground-shock', 44],
    ['cyclonius', Cmd.primary, 'tornado', 60],
  ] as const;
  for (const [race, cmd, id, n] of cases) {
    it(`${id} stuns ${String(n)} game ticks from the hit`, () => {
      const world = duel(race, 'rokcore');
      const [game, evs] = firstHit(world, cmd);
      expect(slug(evs.find((e) => e.kind === SimEventKind.hitConfirmed)?.['ability'] ?? -1)).toBe(id);
      const s = world.state;
      expect(s.arcade[E(1, ArcadeE.stunUntil)]).toBe(game + n);
      expect([s.arcade[E(1, ArcadeE.comboStunTotal)], s.arcade[E(1, ArcadeE.juggle)]]).toEqual([n, 0]);
      // Arcade freezes are stuns: no Classic frozen flag, no Tornado status slot.
      expect((s.flags[1] ?? 0) & EntityFlag.frozen).toBe(0);
      expect(s.status.subarray(STATUS_SLOTS * STATUS_STRIDE, 2 * STATUS_SLOTS * STATUS_STRIDE).every((v) => v === 0)).toBe(
        true,
      );
    });
  }

  it('a stunned character cannot move or cast; it can again on the tick the stun ends', () => {
    const world = duel('sindarosa', 'sindarosa');
    const s = world.state;
    const [game] = firstHit(world, Cmd.primary);
    const until = s.arcade[E(1, ArcadeE.stunUntil)] ?? 0;
    expect(until).toBe(game + 44);
    const cd = cooldownIdx(1, 0);
    const ready = s.abil[cd];
    while (now(s) < until) {
      expect([isStunned(s, 1), canAct(world, 1)]).toEqual([true, false]);
      const x = s.x[1] ?? 0;
      // Only the knockback moves it (none while the hit-stop holds the clock), and no cast books a cooldown.
      const kb = isFrozen(s) ? 0 : (s.arcade[E(1, ArcadeE.kbVx)] ?? 0) / 16;
      const evs = step(world, [0, Cmd.left | Cmd.primary]);
      expect(evs.some((e) => e.sourceId === 1)).toBe(false);
      expect([s.x[1], s.abil[cd]]).toEqual([x + kb, ready]);
    }
    expect(s.x[1]).toBe(580 + 105);
    expect([isStunned(s, 1), canAct(world, 1)]).toEqual([false, true]);
    step(world, [0, Cmd.left | Cmd.primary]);
    expect(s.abil[cd]).not.toBe(ready);
  });

  it('juggle: each hit while stunned takes 2 off, never under 6; at juggle 5 the next hit recovers (reason 1)', () => {
    const world = duel('sindarosa', 'rokcore');
    const s = world.state;
    const sink = new EventSink(0);
    const stuns: number[] = [];
    let g = 0;
    // Each hit lands one tick before the stun would end, so every stun extends the chain.
    for (let k = 0; k < 6; k++) {
      s.arcade[GAME_TICK] = g;
      applyStun(world, sink, 0, 1, 12);
      const until = s.arcade[E(1, ArcadeE.stunUntil)] ?? 0;
      stuns.push(until - g);
      expect(s.arcade[E(1, ArcadeE.juggle)]).toBe(k);
      g = until - 1;
    }
    expect(stuns).toEqual([12, 10, 8, 6, 6, 6]);
    expect([g, sink.events]).toEqual([42, []]);
    s.arcade[GAME_TICK] = g;
    applyStun(world, sink, 0, 1, 12);
    expect(sink.events.map((e) => [e.kind, e['id'], e['reason']])).toEqual([[SimEventKind.recovered, 1, 1]]);
    expect([isStunned(s, 1), isInvulnerable(s, 1), s.arcade[E(1, ArcadeE.invulnUntil)]]).toEqual([false, true, 62]);
    expect([s.arcade[E(1, ArcadeE.juggle)], s.arcade[E(1, ArcadeE.comboStunTotal)]]).toEqual([0, 0]);
    s.arcade[GAME_TICK] = 62;
    expect(isInvulnerable(s, 1)).toBe(false);
  });

  it('stun cap: the hit that would push the chain past 150 ticks ends the stun instead (reason 2)', () => {
    const world = duel('sindarosa', 'rokcore');
    const s = world.state;
    const sink = new EventSink(0);
    const hit = (g: number): void => {
      s.arcade[GAME_TICK] = g;
      applyStun(world, sink, 0, 1, 60);
    };
    hit(0);
    hit(59);
    expect([s.arcade[E(1, ArcadeE.stunUntil)], s.arcade[E(1, ArcadeE.comboStunTotal)]]).toEqual([117, 117]);
    hit(80); // 80 + 56 = 136 adds 19: total 136
    expect([s.arcade[E(1, ArcadeE.stunUntil)], s.arcade[E(1, ArcadeE.comboStunTotal)]]).toEqual([136, 136]);
    hit(100); // juggle 3: 100 + 54 = 154 would add 18: 154 > 150
    expect(sink.events.map((e) => [e['id'], e['reason']])).toEqual([[1, RecoveredReason.stunCap]]);
    expect([s.arcade[E(1, ArcadeE.stunUntil)], s.arcade[E(1, ArcadeE.invulnUntil)], isStunned(s, 1)]).toEqual([
      100, 120, false,
    ]);
  });

  it('a shorter stun never cuts a longer one, and a hit on a free victim starts a new combo', () => {
    const world = duel('sindarosa', 'rokcore');
    const s = world.state;
    const sink = new EventSink(0);
    applyStun(world, sink, 0, 1, 60);
    applyStun(world, sink, 0, 1, 12);
    expect([s.arcade[E(1, ArcadeE.stunUntil)], s.arcade[E(1, ArcadeE.juggle)]]).toEqual([60, 1]);
    s.arcade[GAME_TICK] = 60;
    s.arcade[E(1, ArcadeE.wallBounced)] = 1;
    applyStun(world, sink, 0, 1, 12);
    expect([
      s.arcade[E(1, ArcadeE.stunUntil)], s.arcade[E(1, ArcadeE.juggle)], s.arcade[E(1, ArcadeE.comboStunTotal)],
      s.arcade[E(1, ArcadeE.wallBounced)],
    ]).toEqual([72, 0, 12, 0]);
  });

  it('an invulnerable character lets projectiles through and is not touched by melee', () => {
    for (const [race, cmd] of [['sindarosa', Cmd.primary], ['pax', Cmd.secondary]] as const) {
      const world = duel(race, 'rokcore');
      world.state.arcade[E(1, ArcadeE.invulnUntil)] = 1000;
      for (let t = 0; t < 120; t++) {
        world.state.x[1] = 580;
        expect(step(world, [cmd, 0]).some((e) => e.kind === SimEventKind.damage)).toBe(false);
      }
      expect(world.state.hp[1]).toBe(10_000);
    }
  });

  it('Entangling Vines is Snag in Arcade (FUN-DESIGN 2.20): it roots 60 once per cast, no stun, no Classic freeze or effect entity', () => {
    const world = duel('treenoc', 'rokcore');
    const s = world.state;
    let game = -1;
    for (let t = 0; t < 30 && game < 0; t++) {
      const g = now(s);
      step(world, [Cmd.primary, 0]);
      if ((s.arcade[E(1, ArcadeE.rootUntil)] ?? 0) !== 0) game = g;
    }
    expect(s.arcade[E(1, ArcadeE.rootUntil)]).toBe(game + 60);
    expect(s.arcade[E(1, ArcadeE.stunUntil)]).toBe(0);
    expect((s.flags[1] ?? 0) & EntityFlag.frozen).toBe(0);
    for (let t = 0; t < 10; t++) step(world, [0, 0]);
    expect([s.arcade[E(1, ArcadeE.rootUntil)], s.arcade[E(1, ArcadeE.stunUntil)], s.arcade[E(1, ArcadeE.juggle)]]).toEqual([game + 60, 0, 0]);
  });
});

describe('knockback', () => {
  it('travels 21, 45, 105 and 136 px for light, medium, heavy and super, and moves a stunned victim', () => {
    const got = KNOCKBACK_Q4.map((q) => {
      const world = duel('sindarosa', 'rokcore');
      world.state.x[1] = 400;
      setKnockback(world.state, 1, q, EAST);
      return slide(world)[0];
    });
    expect(got).toEqual([21, 45, 105, 136]);
    const world = duel('sindarosa', 'rokcore');
    world.state.arcade[E(1, ArcadeE.stunUntil)] = 1000;
    setKnockback(world.state, 1, KNOCKBACK_Q4[HitStrength.light], 5); // dir8 5: south-west
    expect(slide(world)).toEqual([-21, 21]);
  });

  it('a projectile pushes along its dir8; melee along the caster-to-victim centre delta', () => {
    const proj = duel('sindarosa', 'rokcore');
    firstHit(proj, Cmd.primary);
    expect([proj.state.arcade[E(1, ArcadeE.kbVx)], proj.state.arcade[E(1, ArcadeE.kbVy)]]).toEqual([224, 0]);
    // Ground Shock is centred on Pax; the victim sits up and to the left of it.
    const melee = duel('pax', 'rokcore');
    melee.state.x[1] = 440;
    melee.state.y[1] = 240;
    firstHit(melee, Cmd.secondary);
    expect([melee.state.arcade[E(1, ArcadeE.kbVx)], melee.state.arcade[E(1, ArcadeE.kbVy)]]).toEqual([-224, -224]);
  });

  it('bounces off the first wall of a combo at half speed, then stops at the next one; a new combo resets it', () => {
    const world = duel('sindarosa', 'rokcore');
    const s = world.state;
    const maxX = world.arena.x + world.arena.w - (s.w[1] ?? 0);
    s.x[1] = maxX - 30;
    setKnockback(s, 1, KNOCKBACK_Q4[HitStrength.heavy], EAST);
    slide(world);
    // 14 + 13 then the wall (192 Q4 left), back at -96 decayed: 5 + 4 + 3 + 2 + 1 px.
    expect([s.x[1], s.arcade[E(1, ArcadeE.wallBounced)]]).toEqual([maxX - 15, 1]);
    setKnockback(s, 1, KNOCKBACK_Q4[HitStrength.heavy], EAST);
    slide(world);
    expect(s.x[1]).toBe(maxX);
    applyStun(world, new EventSink(0), 0, 1, 12); // a free victim: new combo
    expect(s.arcade[E(1, ArcadeE.wallBounced)]).toBe(0);
  });

  it('clamps both axes to the arena (the bounds-y typo is fixed in Arcade)', () => {
    const world = duel('sindarosa', 'rokcore');
    const s = world.state;
    s.y[1] = world.arena.y + 5;
    s.arcade[E(1, ArcadeE.wallBounced)] = 1;
    setKnockback(s, 1, KNOCKBACK_Q4[HitStrength.super], NORTH);
    slide(world);
    expect(s.y[1]).toBe(world.arena.y);
    // Walking into the top wall holds y too (Classic restores only x).
    s.x[0] = world.arena.x + 2;
    s.y[0] = world.arena.y + 2;
    for (let t = 0; t < 5; t++) step(world, [Cmd.up | Cmd.left, 0]);
    expect([s.x[0], s.y[0], s.dir[0]]).toEqual([world.arena.x + 2, world.arena.y + 2, WEST]);
  });
});

describe('stun properties', () => {
  it('fuzz: no stun chain passes 150 game ticks and juggle never passes 5, for any hit timing and base', () => {
    const hits = fc.array(fc.tuple(fc.integer({ min: 0, max: 30 }), fc.integer({ min: 1, max: 80 })), {
      minLength: 1, maxLength: 120,
    });
    fc.assert(
      fc.property(hits, (seq) => {
        const world = duel('sindarosa', 'rokcore');
        const s = world.state;
        const sink = new EventSink(0);
        let g = 0;
        let chainStart = -1;
        for (const [gap, base] of seq) {
          g += gap;
          s.arcade[GAME_TICK] = g;
          // Stun only ever extends, so a victim that is free at g has ended its chain.
          if (!isStunned(s, 1)) chainStart = -1;
          applyStun(world, sink, 0, 1, base);
          if (isStunned(s, 1) && chainStart < 0) chainStart = g;
          if (isStunned(s, 1)) expect((s.arcade[E(1, ArcadeE.stunUntil)] ?? 0) - chainStart).toBeLessThanOrEqual(150);
          expect(s.arcade[E(1, ArcadeE.juggle)]).toBeLessThanOrEqual(JUGGLE_LIMIT);
          expect(s.arcade[E(1, ArcadeE.comboStunTotal)]).toBeLessThanOrEqual(COMBO_STUN_CAP_TICKS);
        }
      }),
      { numRuns: 200, seed: 0x57a1 },
    );
  });

  const race = fc.constantFrom(...CHARACTERS.filter((c) => c.id !== 'eternal-void').map((c) => c.id));
  const cmd = fc.integer({ min: 0, max: 0x3fff });
  const sticky = fc
    .array(fc.tuple(fc.integer({ min: 1, max: 40 }), cmd, cmd), { minLength: 1, maxLength: 12 })
    .map((runs) => runs.flatMap(([k, p, q]) => Array.from({ length: k }, (): [number, number] => [p, q])));

  it('Arcade duels: stun chains stay within 150 game ticks, characters stay in the arena, and replays match', () => {
    let stuns = 0;
    fc.assert(
      fc.property(race, race, sticky, fc.nat(), (a, b, inputs, cut) => {
        const play = (): number[] => {
          const world = duel(a, b);
          const s = world.state;
          const chain = new Int32Array(MAX_ENTITIES);
          return inputs.map(([p, q]) => {
            const frozen = isFrozen(s);
            step(world, [p, q]);
            for (const id of [0, 1]) {
              if (!frozen) chain[id] = isStunned(s, id) ? (chain[id] ?? 0) + 1 : 0;
              expect(chain[id]).toBeLessThanOrEqual(COMBO_STUN_CAP_TICKS);
              const x = s.x[id] ?? 0;
              const y = s.y[id] ?? 0;
              expect(x >= world.arena.x && x + (s.w[id] ?? 0) <= world.arena.x + world.arena.w).toBe(true);
              expect(y >= world.arena.y && y + (s.h[id] ?? 0) <= world.arena.y + world.arena.h).toBe(true);
            }
            if (isStunned(s, 0) || isStunned(s, 1)) stuns++;
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
      { numRuns: 30, seed: 0x5717 },
    );
    expect(stuns).toBeGreaterThan(100);
  });
});
