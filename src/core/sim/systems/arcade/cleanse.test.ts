import { describe, expect, it } from 'vitest';
import { CLEANSE_COOLDOWN_TICKS, SnagEvent } from '../../../data/arcade';
import { CHARACTERS } from '../../../data/characters';
import { characterId } from '../../../data/ids';
import { DEFAULT_SIM_FLAGS } from '../../../flags';
import { now } from '../../clock';
import { Cmd } from '../../commands';
import { SimEventKind, type SimEvent } from '../../events';
import { hash } from '../../hash';
import { createMatch, type MatchSetup } from '../../match';
import { createSnapshotBuf, restore, snapshot } from '../../snapshot';
import { ARCADE_E, ArcadeE } from '../../state';
import { step } from '../../step';
import type { SimWorld } from '../../world';
import { hasSlow, onProjectileHit } from '../debuffs';
import { applyTimedStatus, StatusId } from '../status';
import { cleansableCount } from './cleanse';
import { skipIntro } from './round-testkit';
import { kindOf } from './terrain';

const E = (id: number, f: number): number => id * ARCADE_E + f;

/** `p1` (id 0) at (300, 300) against `p2` (id 1) 150 px to its right. */
function duel(p1: string, p2 = 'pax', arcade = true): SimWorld {
  const setup: MatchSetup = {
    simVersion: 47, seed: 9, flags: { ...DEFAULT_SIM_FLAGS, rulesetArcade: arcade }, chapter: 1, difficulty: 1,
    p1: [{ character: characterId(p1), xp: 1 }],
    p2: [{ character: characterId(p2), xp: 1 }],
  };
  const world = arcade ? skipIntro(createMatch(setup)) : createMatch(setup);
  const s = world.state;
  s.x[0] = 300; s.y[0] = 300; s.dir[0] = 0;
  s.x[1] = 450; s.y[1] = 300; s.dir[1] = 4;
  return world;
}

const cleanses = (evs: readonly SimEvent[]): SimEvent[] => evs.filter((e) => e.kind === SimEventKind.cleanse);

/** Roots, Puddle-slows, Ice Blasts and tidal-slows hero 0. */
function debuff(world: SimWorld): void {
  const s = world.state;
  const g = now(s);
  s.arcade[E(0, ArcadeE.rootUntil)] = g + 60;
  s.arcade[E(0, ArcadeE.trapSlowUntil)] = g + 60;
  onProjectileHit(world, 'ice-blast', 0, 1);
  applyTimedStatus(world, 0, StatusId.superSlow, 1, 200, -1.5);
}

describe('common Cleanse (ideas/in-progress/elemental-cleanse.md)', () => {
  it('has a 10 s cooldown and its own command bit (swap3 in Classic)', () => {
    expect(CLEANSE_COOLDOWN_TICKS).toBe(500);
    expect(Cmd.cleanse).toBe(Cmd.swap3);
  });

  it('ends the root, Puddle slow, Ice Blast and tidal slow at once and emits the event', () => {
    const world = duel('sindarosa');
    const s = world.state;
    const g = now(s);
    debuff(world);
    expect(hasSlow(s.status, 0)).toBe(true);
    expect(cleansableCount(world, 0)).toBe(4);
    const evs = step(world, [Cmd.cleanse, 0]);
    expect(cleanses(evs)).toMatchObject([{ sourceId: 0, element: 1, team: 0, cleared: 4 }]);
    expect(evs.filter((e) => e.kind === SimEventKind.snag)).toMatchObject([{ id: 0, reason: SnagEvent.freed }]);
    expect(s.arcade[E(0, ArcadeE.rootUntil)]).toBe(0);
    expect(s.arcade[E(0, ArcadeE.trapSlowUntil)]).toBe(0);
    expect(hasSlow(s.status, 0)).toBe(false);
    expect(s.speed[0]).toBeCloseTo(s.baseSpeed[0] ?? 0, 9);
    expect(s.arcade[E(0, ArcadeE.cleanseReadyAt)]).toBe(g + CLEANSE_COOLDOWN_TICKS);
    expect(cleansableCount(world, 0)).toBe(0);
  });

  it('does not touch the foe, and is not the elemental ability', () => {
    const world = duel('curomo');
    const s = world.state;
    s.arcade[E(1, ArcadeE.rootUntil)] = now(s) + 60;
    step(world, [Cmd.cleanse, 0]);
    expect(s.arcade[E(1, ArcadeE.rootUntil)]).toBeGreaterThan(0);
    expect(s.arcade[E(0, ArcadeE.elemReadyAt)]).toBe(0);
  });

  it('with nothing to clear still spends the cooldown (cleared 0), then refuses until it is over', () => {
    const world = duel('pax');
    const s = world.state;
    const g = now(s);
    expect(cleanses(step(world, [Cmd.cleanse, 0]))).toMatchObject([{ element: 3, cleared: 0 }]);
    let early = 0;
    while (now(s) < g + CLEANSE_COOLDOWN_TICKS - 1) early += cleanses(step(world, [now(s) % 2 === 0 ? 0 : Cmd.cleanse, 0])).length;
    expect(early).toBe(0);
    let late = 0;
    for (let i = 0; i < 6; i++) late += cleanses(step(world, [i % 2 === 0 ? 0 : Cmd.cleanse, 0])).length;
    expect(late).toBe(1);
  });

  it('is refused while stunned and fires from the buffer once the stun is over', () => {
    const world = duel('cyclonius');
    const s = world.state;
    s.arcade[E(0, ArcadeE.rootUntil)] = now(s) + 60;
    s.arcade[E(0, ArcadeE.stunUntil)] = now(s) + 4;
    expect(cleanses(step(world, [Cmd.cleanse, 0]))).toEqual([]);
    expect(s.arcade[E(0, ArcadeE.cleanseReadyAt)]).toBe(0);
    const evs: SimEvent[] = [];
    for (let i = 0; i < 8; i++) evs.push(...step(world, [0, 0]));
    expect(cleanses(evs)).toHaveLength(1);
  });

  it('works for every hero, with the hero element in the event, and does not exist in Classic', () => {
    for (const c of CHARACTERS) {
      const world = duel(c.id);
      const kind = kindOf(world.state, 0);
      expect(cleanses(step(world, [Cmd.cleanse, 0])), c.id).toMatchObject([{ element: kind, team: 0 }]);
    }
    expect(cleanses(step(duel('sindarosa', 'pax', false), [Cmd.cleanse, 0]))).toEqual([]);
  });

  it('keeps the cooldown through a snapshot round trip and replays deterministically', () => {
    const a = duel('morblass');
    debuff(a);
    step(a, [Cmd.cleanse, 0]);
    const buf = createSnapshotBuf(a.state);
    snapshot(a.state, buf);
    const b = duel('morblass');
    restore(b.state, buf);
    for (let i = 0; i < 20; i++) {
      step(a, [Cmd.cleanse | Cmd.right, 0]);
      step(b, [Cmd.cleanse | Cmd.right, 0]);
    }
    expect(hash(b.state)).toBe(hash(a.state));
    expect(b.state.arcade[E(0, ArcadeE.cleanseReadyAt)]).toBe(a.state.arcade[E(0, ArcadeE.cleanseReadyAt)]);
  });
});
