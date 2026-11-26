import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  COMBO_STUN_CAP_TICKS, SUPER_COMBO_STUN_CAP_TICKS, FREEZE_STUN_TICKS, HIT_STUN_TICKS, HitStrength, JUGGLE_LIMIT, JUGGLE_STUN_STEP, KNOCKBACK_DECAY_Q4,
  KNOCKBACK_Q4, MIN_HIT_STUN_TICKS, RECOVERY_INVULN_TICKS, RecoveredReason, STUN_IMMUNE_TICKS,
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
import { applyStun, canAct, isInvulnerable, isStunned, stunImmune } from './stun';

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
    expect(HIT_STUN_TICKS).toEqual([12, 16, 20, 26]);
    expect([JUGGLE_STUN_STEP, MIN_HIT_STUN_TICKS, JUGGLE_LIMIT]).toEqual([4, 6, 3]);
    expect([COMBO_STUN_CAP_TICKS, RECOVERY_INVULN_TICKS, FREEZE_STUN_TICKS]).toEqual([72, 20, 45]);
    expect(STUN_IMMUNE_TICKS).toBe(30);
    expect(KNOCKBACK_Q4).toEqual([96, 144, 224, 256]);
    expect(KNOCKBACK_DECAY_Q4).toBe(16);
    expect([RecoveredReason.stunEnded, RecoveredReason.juggleCap, RecoveredReason.stunCap]).toEqual([0, 1, 2]);
  });

  it('per ability: stun by strength, Tornado 45 and Entangling Vines (the Snag hit) 12', () => {
    expect(HIT_STUN).toHaveLength(ABILITY_DEFS.length);
    const want: Record<string, number> = {
      'wind-cone': 12, fireball: 16, 'fire-blast': 20, 'ground-shock': 20, hurricane: 12, tornado: 45,
      'entangling-vines': 12,
    };
    for (const [id, n] of Object.entries(want)) expect([id, stunOf(id)]).toEqual([id, n]);
  });
});

describe('hit-stun', () => {
  const cases = [
    ['cyclonius', Cmd.secondary, 'wind-cone', 12],
    ['fiara', Cmd.secondary, 'fireball', 16],
    ['sindarosa', Cmd.primary, 'fire-blast', 20],
    ['pax', Cmd.secondary, 'ground-shock', 20],
    ['cyclonius', Cmd.primary, 'tornado', 45],
  ] as const;
  for (const [race, cmd, id, n] of cases) {
    it(`${id} stuns ${String(n)} game ticks from the hit`, () => {
      const world = duel(race, 'pax');
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
    expect(until).toBe(game + 20);
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

  it('juggle: each hit while stunned takes JUGGLE_STUN_STEP (4) off, never under 6; at juggle 3 the next hit recovers (reason 1)', () => {
    const world = duel('sindarosa', 'pax');
    const s = world.state;
    const sink = new EventSink(0);
    const stuns: number[] = [];
    let g = 0;
    // Each hit lands one tick before the stun would end, so every stun extends the chain.
    for (let k = 0; k < 4; k++) {
      s.arcade[GAME_TICK] = g;
      applyStun(world, sink, 0, 1, 20);
      const until = s.arcade[E(1, ArcadeE.stunUntil)] ?? 0;
      stuns.push(until - g);
      expect(s.arcade[E(1, ArcadeE.juggle)]).toBe(k);
      g = until - 1;
    }
    expect(stuns).toEqual([20, 16, 12, 8]);
    expect([g, sink.events]).toEqual([52, []]);
    s.arcade[GAME_TICK] = g;
    applyStun(world, sink, 0, 1, 20);
    expect(sink.events.map((e) => [e.kind, e['id'], e['reason']])).toEqual([[SimEventKind.recovered, 1, 1]]);
    expect([isStunned(s, 1), isInvulnerable(s, 1), s.arcade[E(1, ArcadeE.invulnUntil)]]).toEqual([false, true, 72]);
    expect([s.arcade[E(1, ArcadeE.juggle)], s.arcade[E(1, ArcadeE.comboStunTotal)]]).toEqual([0, 0]);
    s.arcade[GAME_TICK] = 72;
    expect(isInvulnerable(s, 1)).toBe(false);
  });

  it('stun cap: the hit that would push the chain past COMBO_STUN_CAP_TICKS (72) ends the stun instead (reason 2)', () => {
    const world = duel('sindarosa', 'pax');
    const s = world.state;
    const sink = new EventSink(0);
    const hit = (g: number): void => {
      s.arcade[GAME_TICK] = g;
      applyStun(world, sink, 0, 1, 60);
    };
    hit(0); // base 60 on a 72 cap: 60
    expect([s.arcade[E(1, ArcadeE.stunUntil)], s.arcade[E(1, ArcadeE.comboStunTotal)]]).toEqual([60, 60]);
    hit(30); // juggle 1: 30 + 56 = 86 adds 26: total 86 > 72
    expect(sink.events.map((e) => [e['id'], e['reason']])).toEqual([[1, RecoveredReason.stunCap]]);
    expect([s.arcade[E(1, ArcadeE.stunUntil)], s.arcade[E(1, ArcadeE.invulnUntil)], isStunned(s, 1)]).toEqual([
      30, 50, false,
    ]);
  });

  it.each([
    ['fireball', 16, 26, 16],
    ['wind cone', 12, 20, 12],
    ['icicles', 12, 15, 12],
    ['fire blast', 20, 30, 20],
  ])('%s chain (base %i, re-hit every %i ticks) is stunned until game tick %i', (_n, base, cd, end) => {
    const world = duel('sindarosa', 'pax');
    const s = world.state;
    const sink = new EventSink(0);
    s.arcade[GAME_TICK] = 0;
    applyStun(world, sink, 0, 1, base);
    for (let g = cd; (s.arcade[E(1, ArcadeE.stunUntil)] ?? 0) > g; g += cd) {
      s.arcade[GAME_TICK] = g;
      applyStun(world, sink, 0, 1, base);
    }
    expect(sink.events).toEqual([]);
    expect([s.arcade[E(1, ArcadeE.stunUntil)], s.arcade[E(1, ArcadeE.comboStunTotal)]]).toEqual([end, end]);
  });

  it('a shorter stun never cuts a longer one, and a hit on a free victim starts a new combo', () => {
    const world = duel('sindarosa', 'pax');
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
      const world = duel(race, 'pax');
      world.state.arcade[E(1, ArcadeE.invulnUntil)] = 1000;
      for (let t = 0; t < 120; t++) {
        world.state.x[1] = 580;
        expect(step(world, [cmd, 0]).some((e) => e.kind === SimEventKind.damage)).toBe(false);
      }
      expect(world.state.hp[1]).toBe(10_000);
    }
  });

  it('Entangling Vines is Snag in Arcade (FUN-DESIGN 2.20): it roots 60 once per cast and its hit stuns SNAG_STUN_TICKS (12), no Classic freeze or effect entity', () => {
    const world = duel('treenoc', 'pax');
    const s = world.state;
    let game = -1;
    for (let t = 0; t < 30 && game < 0; t++) {
      const g = now(s);
      step(world, [Cmd.primary, 0]);
      if ((s.arcade[E(1, ArcadeE.rootUntil)] ?? 0) !== 0) game = g;
    }
    expect(s.arcade[E(1, ArcadeE.rootUntil)]).toBe(game + 60);
    expect(s.arcade[E(1, ArcadeE.stunUntil)]).toBe(game + 12);
    expect(s.hp[1]).toBeLessThan(10_000); // the rope hurts (SNAG_DAMAGE)
    expect((s.flags[1] ?? 0) & EntityFlag.frozen).toBe(0);
    for (let t = 0; t < 10; t++) step(world, [0, 0]);
    expect(s.arcade[E(1, ArcadeE.rootUntil)]).toBe(game + 60); // one root per cast, not renewed by the hit box
  });
});

describe('knockback', () => {
  it('travels 21, 45, 105 and 136 px for light, medium, heavy and super, and moves a stunned victim', () => {
    const got = KNOCKBACK_Q4.map((q) => {
      const world = duel('sindarosa', 'pax');
      world.state.x[1] = 400;
      setKnockback(world.state, 1, q, EAST);
      return slide(world)[0];
    });
    expect(got).toEqual([21, 45, 105, 136]);
    const world = duel('sindarosa', 'pax');
    world.state.arcade[E(1, ArcadeE.stunUntil)] = 1000;
    setKnockback(world.state, 1, KNOCKBACK_Q4[HitStrength.light], 5); // dir8 5: south-west
    expect(slide(world)).toEqual([-21, 21]);
  });

  it('a projectile pushes along its dir8; melee along the caster-to-victim centre delta', () => {
    const proj = duel('sindarosa', 'pax');
    firstHit(proj, Cmd.primary);
    expect([proj.state.arcade[E(1, ArcadeE.kbVx)], proj.state.arcade[E(1, ArcadeE.kbVy)]]).toEqual([224, 0]);
    // Ground Shock is centred on Pax; the victim sits up and to the left of it.
    const melee = duel('pax', 'treenoc');
    melee.state.x[1] = 440;
    melee.state.y[1] = 240;
    firstHit(melee, Cmd.secondary);
    expect([melee.state.arcade[E(1, ArcadeE.kbVx)], melee.state.arcade[E(1, ArcadeE.kbVy)]]).toEqual([-224, -224]);
  });

  it('bounces off the first wall of a combo at half speed, then stops at the next one; a new combo resets it', () => {
    const world = duel('sindarosa', 'pax');
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
    const world = duel('sindarosa', 'pax');
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

describe('stun immunity after a stun ends (SIM_VERSION 98)', () => {
  const LATE = 500;
  /** A fireball hit on a victim whose last stun ended `ago` ticks before the hit tick `at`; returns [stunned after the hit, hp lost, kb]. */
  function hitAfter(ago: number, at: number): [boolean, number, number] {
    const world = duel('fiara', 'pax');
    const s = world.state;
    s.arcade[GAME_TICK] = LATE;
    s.arcade[E(1, ArcadeE.stunUntil)] = at - ago;
    const hp = s.hp[1] ?? 0;
    firstHit(world, Cmd.secondary);
    return [isStunned(s, 1), hp - (s.hp[1] ?? 0), Math.abs(s.arcade[E(1, ArcadeE.kbVx)] ?? 0)];
  }
  const hitTick = (): number => {
    const world = duel('fiara', 'pax');
    world.state.arcade[GAME_TICK] = LATE;
    return firstHit(world, Cmd.secondary)[0];
  };

  it('a hit inside the window lands (damage, knockback) without a stun; at exactly STUN_IMMUNE_TICKS it stuns', () => {
    const at = hitTick();
    const [inStun, inDmg, inKb] = hitAfter(STUN_IMMUNE_TICKS - 1, at);
    expect([inStun, inDmg > 0, inKb > 0]).toEqual([false, true, true]);
    expect(hitAfter(STUN_IMMUNE_TICKS, at)[0]).toBe(true);
    expect(hitAfter(0, at)[0]).toBe(false);
  });

  it('a cap recovery opens the window too', () => {
    const world = duel('sindarosa', 'pax');
    const s = world.state;
    const sink = new EventSink(0);
    s.arcade[GAME_TICK] = LATE;
    for (let i = 0; i < 5; i++) applyStun(world, sink, 0, 1, 20); // juggle cap ends the chain at the 5th hit
    expect(isStunned(s, 1)).toBe(false);
    expect(stunImmune(s, 1)).toBe(true);
    s.arcade[GAME_TICK] = LATE + STUN_IMMUNE_TICKS;
    expect(stunImmune(s, 1)).toBe(false);
  });

  it('is never true in Classic, before a first stun, or while stunned', () => {
    expect(stunImmune(duel('fiara', 'pax', false).state, 1)).toBe(false);
    const world = duel('fiara', 'pax');
    expect(stunImmune(world.state, 1)).toBe(false);
    applyStun(world, new EventSink(0), 0, 1, 40);
    expect(stunImmune(world.state, 1)).toBe(false);
  });

  it('parry and guard break keep their stun inside the window', () => {
    // Both call applyStun directly (guard.ts), which has no immunity check; the hit path is the only gate.
    const world = duel('sindarosa', 'pax');
    const s = world.state;
    s.arcade[GAME_TICK] = LATE;
    s.arcade[E(1, ArcadeE.stunUntil)] = LATE - 3;
    applyStun(world, new EventSink(0), 0, 1, 60);
    expect(isStunned(s, 1)).toBe(true);
  });

  it('property: a plain hit stuns iff the last stun ended STUN_IMMUNE_TICKS or more ago', () => {
    const at = hitTick();
    fc.assert(fc.property(fc.integer({ min: 0, max: 60 }), (ago) => {
      expect(hitAfter(ago, at)[0]).toBe(ago >= STUN_IMMUNE_TICKS);
    }), { numRuns: 25, seed: 0x98 });
  });
});

describe('stun properties', () => {
  it('fuzz: no stun chain passes COMBO_STUN_CAP_TICKS game ticks and juggle never passes 5, for any hit timing and base', () => {
    const hits = fc.array(fc.tuple(fc.integer({ min: 0, max: 30 }), fc.integer({ min: 1, max: 80 })), {
      minLength: 1, maxLength: 120,
    });
    fc.assert(
      fc.property(hits, (seq) => {
        const world = duel('sindarosa', 'pax');
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
          if (isStunned(s, 1)) expect((s.arcade[E(1, ArcadeE.stunUntil)] ?? 0) - chainStart).toBeLessThanOrEqual(COMBO_STUN_CAP_TICKS);
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

  it('Arcade duels: stun chains stay within COMBO_STUN_CAP_TICKS game ticks, characters stay in the arena, and replays match', () => {
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

describe('stun is a flinch, not a lock (SIM_VERSION 117)', () => {
  // Mirrors the hit path: a plain hit stuns only when the victim is not inside the re-stun window (hit.ts).
  const chain = (hits: readonly (readonly [number, number])[], ticks: number): [number, number] => {
    const world = duel('sindarosa', 'pax');
    const s = world.state;
    const sink = new EventSink(0);
    let stunned = 0;
    let run = 0;
    let longest = 0;
    for (let g = 0; g < ticks; g++) {
      s.arcade[GAME_TICK] = g;
      for (const [every, base] of hits) {
        if (g % every === 0 && !stunImmune(s, 1)) applyStun(world, sink, 0, 1, base);
      }
      if (isStunned(s, 1)) {
        stunned++;
        run++;
        longest = Math.max(longest, run);
      } else run = 0;
    }
    return [stunned / ticks, longest];
  };

  it('a light hit every 20 ticks stuns at most 35% of 1000 ticks and never more than 26 in a row', () => {
    const [share, longest] = chain([[20, HIT_STUN_TICKS[0]]], 1000);
    expect(share).toBeLessThanOrEqual(0.35);
    expect(longest).toBeLessThanOrEqual(26);
  });

  it('a double team of light, medium and heavy hitters never chains past COMBO_STUN_CAP_TICKS', () => {
    const [, longest] = chain([[20, HIT_STUN_TICKS[0]], [30, HIT_STUN_TICKS[1]], [26, HIT_STUN_TICKS[2]]], 2000);
    expect(longest).toBeLessThanOrEqual(COMBO_STUN_CAP_TICKS);
  });

  it('a super hit that would pass SUPER_COMBO_STUN_CAP_TICKS recovers the victim (stunCap, invulnerable)', () => {
    const world = duel('sindarosa', 'pax');
    const s = world.state;
    const sink = new EventSink(0);
    applyStun(world, sink, 0, 1, 26, true);
    applyStun(world, sink, 0, 1, 26, true);
    applyStun(world, sink, 0, 1, 26, true); // 26 + 22 + 18 = 66 so far
    expect(sink.events).toEqual([]);
    s.arcade[GAME_TICK] = 5;
    applyStun(world, sink, 0, 1, 200, true); // would add far past 80
    expect(sink.events.map((e) => [e.kind, e['reason']])).toEqual([[SimEventKind.recovered, RecoveredReason.stunCap]]);
    expect(s.arcade[E(1, ArcadeE.stunUntil)]).toBe(5);
    expect(s.arcade[E(1, ArcadeE.invulnUntil)]).toBe(5 + RECOVERY_INVULN_TICKS);
  });

  it('a super hit leaving the chain between the plain cap and the super cap still extends the stun', () => {
    const world = duel('sindarosa', 'pax');
    const s = world.state;
    const sink = new EventSink(0);
    applyStun(world, sink, 0, 1, 76, true);
    const total = s.arcade[E(1, ArcadeE.comboStunTotal)] ?? 0;
    expect(total).toBeGreaterThan(COMBO_STUN_CAP_TICKS);
    expect(total).toBeLessThanOrEqual(SUPER_COMBO_STUN_CAP_TICKS);
    expect(sink.events).toEqual([]);
    expect(s.arcade[E(1, ArcadeE.stunUntil)]).toBe(total);
  });

  it('a super hit after a prefix still applies its stun (the sup bypass)', () => {
    const world = duel('sindarosa', 'pax');
    const s = world.state;
    const sink = new EventSink(0);
    for (let i = 0; i < 4; i++) applyStun(world, sink, 0, 1, 20); // juggle 3: a plain hit now recovers
    applyStun(world, sink, 0, 1, 46, true);
    expect(sink.events).toEqual([]);
    expect(isStunned(s, 1)).toBe(true);
    expect(s.arcade[E(1, ArcadeE.stunUntil)]).toBeGreaterThanOrEqual(30);
    applyStun(world, sink, 0, 1, 20);
    expect(isStunned(s, 1)).toBe(false);
  });
});
