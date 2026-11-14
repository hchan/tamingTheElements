import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  CHARGE_AI_MIN_DIST, CHARGE_COOLDOWN_TICKS, CHARGE_DAMAGE, CHARGE_MAX_STEP_PX, CHARGE_SPEED_MULT, CHARGE_STUN_TICKS,
  CHARGE_TICKS, ChargeEnd, METER_CHARGE,
} from '../../../data/arcade';
import { CHARACTERS } from '../../../data/characters';
import { characterId } from '../../../data/ids';
import { DEFAULT_SIM_FLAGS } from '../../../flags';
import { now } from '../../clock';
import { Cmd, inputMaskFor, type Command } from '../../commands';
import { SimEventKind, type SimEvent } from '../../events';
import { hash } from '../../hash';
import { createMatch, type MatchSetup } from '../../match';
import { EventSink } from '../../events';
import { applyArcadeHit } from './hit';
import { createSnapshotBuf, restore, snapshot } from '../../snapshot';
import { ARCADE_E, ArcadeE, EntityFlag } from '../../state';
import { step } from '../../step';
import type { SimWorld } from '../../world';
import { meterOf, RANGED } from './meter';
import { skipIntro } from './round-testkit';
import { isStunned } from './stun';

const C = Cmd.charge;
const E = (id: number, f: number): number => id * ARCADE_E + f;

/** `p1` (id 0, melee) at (300, 300) against `p2` (id 1) at `foeX`, straight into the fight. */
function duel(foeX = 900, p1 = 'pax', p2 = 'pax'): SimWorld {
  const setup: MatchSetup = {
    simVersion: 24, seed: 9, flags: { ...DEFAULT_SIM_FLAGS, rulesetArcade: true }, chapter: 1, difficulty: 1,
    p1: [{ character: characterId(p1), xp: 1 }],
    p2: [{ character: characterId(p2), xp: 1 }],
  };
  const world = skipIntro(createMatch(setup));
  const s = world.state;
  s.x[0] = 300; s.y[0] = 300; s.dir[0] = 0;
  s.x[1] = foeX; s.y[1] = 300; s.dir[1] = 4;
  return world;
}

const ofKind = (evs: readonly SimEvent[], k: number): SimEvent[] => evs.filter((e) => e.kind === k);

describe('charge numbers (FUN-DESIGN 2.17)', () => {
  it('has the design numbers', () => {
    expect([CHARGE_TICKS, CHARGE_SPEED_MULT, CHARGE_COOLDOWN_TICKS, CHARGE_STUN_TICKS, CHARGE_DAMAGE, METER_CHARGE])
      .toEqual([12, 5, 300, 26, 12, 40]);
    expect(CHARGE_MAX_STEP_PX).toBe(30);
    expect(CHARGE_AI_MIN_DIST).toBeGreaterThan((CHARGE_MAX_STEP_PX * CHARGE_TICKS) / 2);
  });

  it('Cmd.charge is bit 15, Arcade only', () => {
    expect(Cmd.charge).toBe(1 << 15);
    expect(inputMaskFor({ rulesetArcade: false }) & C).toBe(0);
    expect(inputMaskFor({ rulesetArcade: true }) & C).toBe(C);
  });

  it('Pax is melee and Sindarosa is ranged', () => {
    const idx = (id: string): number => CHARACTERS.findIndex((c) => c.id === id);
    expect([RANGED[idx('pax')], RANGED[idx('sindarosa')]]).toEqual([0, 1]);
  });
});

describe('charge movement', () => {
  it('rushes min(5x speed, 30) px per tick for 12 ticks, then expires', () => {
    const world = duel(1200);
    const s = world.state;
    const g0 = now(s);
    const evs = step(world, [C, 0]);
    expect(ofKind(evs, SimEventKind.chargeStarted)).toMatchObject([{ sourceId: 0, dir: 0 }]);
    const stepPx = Math.min((s.speed[0] ?? 0) * CHARGE_SPEED_MULT, CHARGE_MAX_STEP_PX);
    expect(s.x[0]).toBe(300 + stepPx);
    expect(s.arcade[E(0, ArcadeE.chargeUntil)]).toBe(g0 + CHARGE_TICKS);
    expect(s.arcade[E(0, ArcadeE.chargeReadyAt)]).toBe(g0 + CHARGE_COOLDOWN_TICKS);
    let ended: SimEvent[] = [];
    for (let t = 1; t < CHARGE_TICKS; t++) ended = ended.concat(ofKind(step(world, [Cmd.left, 0]), SimEventKind.chargeEnded));
    expect(ended).toMatchObject([{ reason: ChargeEnd.expired }]);
    expect(s.x[0]).toBe(300 + stepPx * CHARGE_TICKS);
  });

  it('ends blocked at the arena wall', () => {
    const world = duel(900);
    world.state.x[0] = world.arena.x + world.arena.w - 100;
    world.state.flags[1] = (world.state.flags[1] ?? 0) & ~EntityFlag.alive; // no foe: the charge follows the aim (east)
    const evs = [...step(world, [C, 0])];
    for (let t = 0; t < 6; t++) evs.push(...step(world, [0, 0]));
    expect(ofKind(evs, SimEventKind.chargeEnded)).toMatchObject([{ reason: ChargeEnd.blocked }]);
    expect(world.state.x[0]).toBe(world.arena.x + world.arena.w - (world.state.w[0] ?? 0));
  });

  it('a ranged hero cannot charge', () => {
    const world = duel(900, 'sindarosa');
    expect(ofKind(step(world, [C, 0]), SimEventKind.chargeStarted)).toHaveLength(0);
  });

  it('cannot start again before the 300-tick cooldown ends', () => {
    const world = duel(1200);
    step(world, [C, 0]);
    let starts = 0;
    for (let t = 1; t < CHARGE_COOLDOWN_TICKS - 1; t++) {
      world.state.x[0] = 300;
      starts += ofKind(step(world, [t % 40 === 0 ? C : 0, 0]), SimEventKind.chargeStarted).length;
    }
    expect(starts).toBe(0);
  });
});

describe('charge arrival', () => {
  it('hits the foe, stuns it, gives meter and ends as arrived', () => {
    const world = duel(560);
    const s = world.state;
    const hp0 = s.hp[1] ?? 0;
    let evs: readonly SimEvent[] = step(world, [C, 0]);
    for (let t = 0; t < 8; t++) evs = evs.concat(step(world, [0, 0]));
    expect(ofKind(evs, SimEventKind.chargeEnded)).toMatchObject([{ reason: ChargeEnd.arrived }]);
    expect(ofKind(evs, SimEventKind.hitConfirmed)).toHaveLength(1);
    expect(hp0 - (s.hp[1] ?? 0)).toBeGreaterThan(0);
    expect(isStunned(s, 1)).toBe(true);
    expect(meterOf(s, 0)).toBeGreaterThanOrEqual(METER_CHARGE);
  });

  it('a foe on its invulnerable dash ticks is passed through', () => {
    const world = duel(520);
    const s = world.state;
    const hp0 = s.hp[1] ?? 0;
    step(world, [C, Cmd.dash | Cmd.left]);
    for (let t = 0; t < 14; t++) step(world, [0, 0]);
    expect(s.hp[1]).toBe(hp0);
  });
});

describe('charge armour (SIM_VERSION 50)', () => {
  it('a charging victim takes the damage without knockback or stun; an idle one is stunned and shoved', () => {
    const run = (charging: boolean): { lost: number; stunned: boolean; moved: boolean } => {
      const world = duel(400);
      const s = world.state;
      if (charging) s.arcade[E(1, ArcadeE.chargeUntil)] = now(s) + CHARGE_TICKS;
      const hp0 = s.hp[1] ?? 0;
      const x0 = s.x[1] ?? 0;
      applyArcadeHit(world, new EventSink(100), 0, 0, 1, 20, 0, 0);
      return { lost: hp0 - (s.hp[1] ?? 0), stunned: isStunned(s, 1), moved: (s.arcade[E(1, ArcadeE.kbVx)] ?? 0) !== 0 || s.x[1] !== x0 };
    };
    const armoured = run(true);
    const plain = run(false);
    expect(armoured.lost).toBeGreaterThan(0);
    expect(armoured.stunned).toBe(false);
    expect(armoured.moved).toBe(false);
    expect(plain.stunned).toBe(true);
    expect(plain.moved).toBe(true);
  });

  it('a charge into a foe that attacks still arrives (armour keeps the rush going)', () => {
    const world = duel(560);
    let evs: readonly SimEvent[] = step(world, [C, Cmd.primary]);
    for (let t = 0; t < 10; t++) evs = evs.concat(step(world, [0, 0]));
    expect(ofKind(evs, SimEventKind.chargeEnded).map((e) => e.reason)).toContain(ChargeEnd.arrived);
  });
});

describe('charge determinism (property)', () => {
  const cmd = fc.constantFrom<Command>(0, C, Cmd.left, Cmd.right, Cmd.up, Cmd.down, Cmd.primary, Cmd.secondary, Cmd.guard, Cmd.dash, C | Cmd.right);
  it('replays identically, after snapshot/restore, and stays inside the arena', () => {
    let charges = 0;
    fc.assert(
      fc.property(fc.array(fc.tuple(cmd, cmd), { minLength: 60, maxLength: 400 }), fc.nat(), (inputs, cut) => {
        const run = (): number[] => {
          const w = duel(700);
          const hs: number[] = [];
          for (const [p, q] of inputs) {
            for (const e of step(w, [p, q])) if (e.kind === SimEventKind.chargeStarted) charges++;
            const s = w.state;
            for (const id of [0, 1]) {
              expect(s.x[id]).toBeGreaterThanOrEqual(w.arena.x);
              expect((s.x[id] ?? 0) + (s.w[id] ?? 0)).toBeLessThanOrEqual(w.arena.x + w.arena.w);
            }
            hs.push(hash(s));
          }
          return hs;
        };
        const a = run();
        expect(run()).toEqual(a);
        const again = duel(700);
        const k = cut % inputs.length;
        for (const [p, q] of inputs.slice(0, k)) step(again, [p, q]);
        const buf = createSnapshotBuf(again.state);
        snapshot(again.state, buf);
        for (const [p, q] of inputs.slice(k)) step(again, [p, q]);
        restore(again.state, buf);
        const rest = inputs.slice(k).map(([p, q]) => {
          step(again, [p, q]);
          return hash(again.state);
        });
        expect(rest).toEqual(a.slice(k));
      }),
      { numRuns: 80, seed: 0xc4a6 },
    );
    expect(charges).toBeGreaterThan(40);
  });
});
