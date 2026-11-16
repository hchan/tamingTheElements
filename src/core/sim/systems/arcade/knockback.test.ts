import { describe, expect, it } from 'vitest';
import { CORNER_PUSH_RANGE_PX, HitStrength } from '../../../data/arcade';
import { characterId } from '../../../data/ids';
import { DEFAULT_SIM_FLAGS } from '../../../flags';
import { now } from '../../clock';
import { EventSink } from '../../events';
import { createMatch, type MatchSetup } from '../../match';
import { ARCADE_E, ArcadeE, EntityFlag } from '../../state';
import { step } from '../../step';
import type { SimWorld } from '../../world';
import { CHARGE_DEF, HIT_STRENGTH, SUPER_DEF, TRAP_BOMB_DEF, TRAP_SPIKE_DEF, applyArcadeHit } from './hit';
import { skipIntro } from './round-testkit';

const KB = (id: number): number => id * ARCADE_E + ArcadeE.kbVx;
/** The first ability def index of a hit strength tier. */
const defOf = (strength: number): number => HIT_STRENGTH.findIndex((x) => x === strength);
const HEAVY = defOf(HitStrength.heavy);

function duel(victim = 'pax'): SimWorld {
  const setup: MatchSetup = {
    simVersion: 85, seed: 7, flags: { ...DEFAULT_SIM_FLAGS, rulesetArcade: true }, chapter: 1, difficulty: 1,
    p1: [{ character: characterId('fiara'), xp: 1 }],
    p2: [{ character: characterId(victim), xp: 1 }],
  };
  return skipIntro(createMatch(setup));
}

/** Attacker (id 0) hits victim (id 1); the victim stands `vx` px from the left wall, the attacker `gap` px to its right. */
function place(w: SimWorld, vx: number, gap: number): void {
  const s = w.state;
  s.x[1] = w.arena.x + vx; s.y[1] = 300;
  s.x[0] = s.x[1] + gap; s.y[0] = 300;
  s.hp[1] = 100_000;
}
const hit = (w: SimWorld, def: number, dir = 4): void => {
  applyArcadeHit(w, new EventSink(now(w.state)), 0, 0, 1, 5, def, dir);
};
/** The smallest n with n(n+1)/2 >= px (setLunge's start speed is 16 n). */
const nFor = (px: number): number => { let n = 1; while ((n * (n + 1)) / 2 < px) n++; return n; };
/** Steps until knockback settles; returns x of `id`. */
const settle = (w: SimWorld, id: number): number => {
  for (let i = 0; i < 400; i++) { step(w, [0, 0]); if (w.state.arcade[KB(id)] === 0) break; }
  return w.state.x[id] ?? 0;
};

describe('corner pushback (SIM_VERSION 84)', () => {
  it('the heavy def exists', () => { expect(HEAVY).toBeGreaterThanOrEqual(0); });

  it('left wall: the victim is clamped and the attacker gets the swallowed travel as a lunge away', () => {
    const w = duel();
    place(w, 10, 60);
    hit(w, HEAVY, 4); // dir 4 = west: the victim is driven into the left wall
    expect(w.state.arcade[KB(1)] ?? 0).toBeLessThan(0);
    const short = 105 - 10; // heavy 224 Q4 -> 105 px, 10 px of room
    expect(w.state.arcade[KB(0)]).toBe(16 * nFor(short));
    expect(w.state.arcade[0 * ARCADE_E + ArcadeE.wallBounced]).toBe(1);
    const x0 = w.state.x[0] ?? 0;
    const end = settle(w, 0);
    expect(end - x0).toBeGreaterThanOrEqual(short);
    expect(end - x0).toBeLessThanOrEqual(short + nFor(short));
  });

  it('right wall mirrors it', () => {
    const w = duel();
    const s = w.state;
    s.x[1] = w.arena.x + w.arena.w - (s.w[1] ?? 0) - 10; s.y[1] = 300; s.x[0] = s.x[1] - 60; s.y[0] = 300;
    s.hp[1] = 100_000;
    hit(w, HEAVY, 0);
    expect(s.arcade[KB(0)]).toBe(-16 * nFor(95));
  });

  it('mid-arena (room for the whole travel): the attacker is not moved', () => {
    const w = duel();
    place(w, 400, 60);
    hit(w, HEAVY, 4);
    expect(w.state.arcade[KB(0)]).toBe(0);
  });

  it('a zoning hit from beyond the range gives no pushback; the victim is still clamped', () => {
    const w = duel();
    place(w, 10, CORNER_PUSH_RANGE_PX + 200);
    hit(w, HEAVY, 4);
    expect(w.state.arcade[KB(0)]).toBe(0);
    settle(w, 1);
    expect(w.state.x[1]).toBeLessThan(w.arena.x + 40); // clamped, then one half-speed bounce
  });

  it('a guarded hit at the wall pushes back from the light travel (21 px minus the room)', () => {
    const w = duel();
    place(w, 5, 60);
    w.state.arcade[1 * ARCADE_E + ArcadeE.blockUntil] = now(w.state) + 100;
    hit(w, HEAVY, 4);
    expect(w.state.arcade[KB(0)]).toBe(16 * nFor(21 - 5)); // the guard holds: the light travel only
  });

  it.each([['super', SUPER_DEF], ['trap bomb', TRAP_BOMB_DEF], ['trap spike', TRAP_SPIKE_DEF]])('no pushback for a %s', (_n, def) => {
    const w = duel();
    place(w, 10, 60);
    hit(w, def, 4);
    expect(w.state.arcade[KB(0)]).toBe(0);
  });

  it('a Charge into a walled victim pushes the charger back (medium 45 px minus the room)', () => {
    const w = duel();
    place(w, 10, 60);
    hit(w, CHARGE_DEF, 4);
    expect(w.state.arcade[KB(0)]).toBe(16 * nFor(45 - 10));
  });

  it('a giant victim: size-weighted travel, so no more pushback than a normal-size victim', () => {
    const plain = duel(); place(plain, 10, 60); hit(plain, HEAVY, 4);
    const giant = duel('rokcore'); place(giant, 10, 60); hit(giant, HEAVY, 4);
    expect(Math.abs(giant.state.arcade[KB(0)] ?? 0)).toBeLessThanOrEqual(Math.abs(plain.state.arcade[KB(0)] ?? 0));
  });

  it('an attacker close to the far wall is stopped there without a bounce', () => {
    const w = duel();
    place(w, 10, 60);
    hit(w, HEAVY, 4);
    const s = w.state;
    s.x[0] = w.arena.x + w.arena.w - (s.w[0] ?? 0) - 3; // a lunge east hits the right wall at once
    settle(w, 0);
    expect(s.x[0]).toBe(w.arena.x + w.arena.w - (s.w[0] ?? 0));
    expect(s.arcade[KB(0)]).toBe(0);
  });

  it('a benched attacker (a tagged-out owner) is not pushed', () => {
    const w = duel();
    place(w, 10, 60);
    w.state.flags[0] = (w.state.flags[0] ?? 0) | EntityFlag.benched;
    hit(w, HEAVY, 4);
    expect(w.state.arcade[KB(0)]).toBe(0);
  });
});
