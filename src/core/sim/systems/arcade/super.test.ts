import { describe, expect, it } from 'vitest';
import {
  HitStopCause, HitStrength, KO_HIT_STOP_TICKS, METER_BAR, SUPER_ACTIVE_TICKS, SUPER_BAND_PX, SUPER_COST,
  SUPER_FREEZE_TICKS, SUPER_HIT_DAMAGE, SUPER_HIT_EVERY, SUPER_ELEMENTAL_BURST, SUPER_INVULN_AFTER_TICKS, comboScalePm,
} from '../../../data/arcade';
import { CHARACTERS } from '../../../data/characters';
import { characterId } from '../../../data/ids';
import { DEFAULT_SIM_FLAGS } from '../../../flags';
import { computeDamage } from '../../../rules/damage';
import { isFrozen, now } from '../../clock';
import { Cmd, type Command } from '../../commands';
import { EventSink, SimEventKind, type SimEvent } from '../../events';
import { hash } from '../../hash';
import { createMatch, type MatchSetup } from '../../match';
import { skipIntro } from './round-testkit';
import { createSnapshotBuf, restore, snapshot } from '../../snapshot';
import { ARCADE_E, ARCADE_T, ARCADE_TEAM_BASE, ArcadeE, ArcadeT, EntityFlag, EntityKind } from '../../state';
import { step } from '../../step';
import type { SimWorld } from '../../world';
import { applyArcadeHit, SUPER_DEF } from './hit';
import { meterOf } from './meter';
import { canAct, inSuper, isInvulnerable } from './stun';

const METER = (team: number): number => ARCADE_TEAM_BASE + team * ARCADE_T + ArcadeT.meter;
const SUPER_STATE = (team: number): number => ARCADE_TEAM_BASE + team * ARCADE_T + ArcadeT.superState;
const SUPER: readonly [Command, Command] = [Cmd.super, 0];
const IDLE: readonly [Command, Command] = [0, 0];
const RACES = CHARACTERS.filter((c) => c.id !== 'dummy' && c.id !== 'eternal-void').map((c) => c.id);

/** Caster (id 0, facing east) at x 400 and victim (id 1) at x 800, same row; team 0 has `meter`. */
function duel(caster = 'sindarosa', victim = 'pax', meter = METER_BAR, arcade = true, bench: string[] = []): SimWorld {
  const setup: MatchSetup = {
    simVersion: 8, seed: 3, flags: { ...DEFAULT_SIM_FLAGS, rulesetArcade: arcade }, chapter: 1, difficulty: 1,
    p1: [caster, ...bench].map((c) => ({ character: characterId(c), xp: 1 })),
    p2: [{ character: characterId(victim), xp: 1 }],
  };
  const world = skipIntro(createMatch(setup));
  const s = world.state;
  s.x[0] = 400;
  s.x[1 + bench.length] = 800;
  if (arcade) s.arcade[METER(0)] = meter;
  return world;
}

/** Steps `n` ticks and returns the events, each tagged with the game tick its step ran at (`g`). */
function run(world: SimWorld, n: number, cmds: readonly [Command, Command] = IDLE): (SimEvent & { g: number })[] {
  const out: (SimEvent & { g: number })[] = [];
  for (let i = 0; i < n; i++) {
    const g = now(world.state);
    for (const e of step(world, cmds)) out.push({ ...e, g });
  }
  return out;
}

const of = (ev: readonly SimEvent[], kind: number): SimEvent[] => ev.filter((e) => e.kind === kind);

describe('super table (FUN-DESIGN 2.5)', () => {
  it('has the design numbers', () => {
    expect([SUPER_COST, SUPER_FREEZE_TICKS, SUPER_INVULN_AFTER_TICKS]).toEqual([1000, 40, 8]);
    expect([SUPER_ACTIVE_TICKS, SUPER_HIT_EVERY, SUPER_HIT_DAMAGE, SUPER_BAND_PX]).toEqual([30, 6, 12, 160]);
  });

  it('super hits keep the 600 pm floor inside a combo; other hits fall to 500', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 9].map((h) => comboScalePm(h, HitStrength.super))).toEqual([1000, 1000, 900, 800, 700, 600, 600, 600]);
    expect(comboScalePm(7, HitStrength.heavy)).toBe(500);
  });
});

describe('super start', () => {
  it('costs one bar, emits superStarted then a 40-tick super freeze, and the freeze holds exactly 40 ticks', () => {
    const world = duel('sindarosa', 'pax', 2500);
    const s = world.state;
    const ev = step(world, SUPER);
    expect(ev.map((e) => e.kind)).toEqual([SimEventKind.meterLevel, SimEventKind.superStarted, SimEventKind.hitStop]);
    expect(of(ev, SimEventKind.meterLevel)[0]).toMatchObject({ team: 0, bars: 1 });
    expect(of(ev, SimEventKind.superStarted)[0]).toMatchObject({ caster: 0, superId: SUPER_ELEMENTAL_BURST, sourceId: 0 });
    expect(of(ev, SimEventKind.hitStop)[0]).toMatchObject({ ticks: 40, cause: HitStopCause.super });
    expect(meterOf(s, 0)).toBe(1500);
    const g = now(s);
    for (let i = 0; i < SUPER_FREEZE_TICKS; i++) {
      expect(isFrozen(s)).toBe(true);
      expect(step(world, SUPER)).toEqual([]);
    }
    expect(isFrozen(s)).toBe(false);
    expect(now(s)).toBe(g);
    expect(meterOf(s, 0)).toBe(1500);
  });

  it('needs a full bar, the Arcade ruleset and a caster that can act', () => {
    const poor = duel('sindarosa', 'pax', SUPER_COST - 1);
    expect(of(run(poor, 5, SUPER), SimEventKind.superStarted)).toEqual([]);
    expect(meterOf(poor.state, 0)).toBe(SUPER_COST - 1);

    const stunned = duel();
    stunned.state.arcade[ArcadeE.stunUntil] = 1000;
    expect(of(run(stunned, 5, SUPER), SimEventKind.superStarted)).toEqual([]);

    const classic = duel('sindarosa', 'pax', 0, false);
    const idle = duel('sindarosa', 'pax', 0, false);
    expect(classic.state.arcade).toHaveLength(0);
    for (let i = 0; i < 60; i++) {
      expect(step(classic, SUPER)).toEqual(step(idle, IDLE));
      expect(hash(classic.state)).toBe(hash(idle.state));
    }
  });

  it('one super at a time: holding the button with 3 bars spends a bar only after the last super ended', () => {
    const world = duel('sindarosa', 'pax', 3 * METER_BAR);
    world.state.y[1] = 100; // out of the band: no hits, no meter gains
    const ev = run(world, 2 * (1 + SUPER_FREEZE_TICKS + SUPER_ACTIVE_TICKS) + 2, SUPER);
    const kinds = ev.filter((e) => e.kind === SimEventKind.superStarted || e.kind === SimEventKind.superEnded).map((e) => e.kind);
    expect(kinds).toEqual([SimEventKind.superStarted, SimEventKind.superEnded, SimEventKind.superStarted, SimEventKind.superEnded, SimEventKind.superStarted]);
    expect(meterOf(world.state, 0)).toBe(0);
  });
});

describe('super invulnerability and lock', () => {
  it('the caster is invulnerable through the freeze and 8 game ticks past it, and cannot act until superEnded', () => {
    const world = duel();
    const s = world.state;
    s.y[1] = 100; // out of the band: no hit-stop changes the count
    step(world, SUPER);
    expect(inSuper(s, 0)).toBe(true);
    let invulnFrozen = 0;
    let invulnAfter = 0;
    let locked = 0;
    for (let i = 0; i < 100; i++) {
      const frozen = isFrozen(s);
      if (isInvulnerable(s, 0)) {
        if (frozen) invulnFrozen++;
        else invulnAfter++;
      }
      if (!canAct(world, 0)) locked++;
      if (of(step(world, IDLE), SimEventKind.superEnded).length > 0) break;
    }
    expect([invulnFrozen, invulnAfter]).toEqual([SUPER_FREEZE_TICKS, SUPER_INVULN_AFTER_TICKS]);
    expect(locked).toBe(SUPER_FREEZE_TICKS + SUPER_ACTIVE_TICKS + 1);
    expect([inSuper(s, 0), canAct(world, 0)]).toEqual([false, true]);
  });

  it('a hit on the caster while its super runs is a counter hit', () => {
    const world = duel();
    const s = world.state;
    s.y[1] = 100;
    run(world, 1 + SUPER_FREEZE_TICKS + SUPER_INVULN_AFTER_TICKS, SUPER);
    expect(isInvulnerable(s, 0)).toBe(false);
    const sink = new EventSink(0);
    applyArcadeHit(world, sink, 1, 1, 0, 10, 0, 4);
    expect(of(sink.events, SimEventKind.hitConfirmed)[0]?.['counter']).toBe(1);
  });
});

describe('Elemental Burst (the Inferno Beam shape)', () => {
  it('is a 160 px band from the caster centre to the wall on its facing side', () => {
    const cases = [[0, 440, 280, 840, 160], [4, 0, 280, 440, 160], [2, 360, 100, 160, 260], [6, 360, 360, 160, 360]] as const;
    for (const [dir, x, y, w, h] of cases) {
      const world = duel();
      const s = world.state;
      s.dir[0] = dir;
      step(world, SUPER);
      const fx = (s.arcade[SUPER_STATE(0)] ?? 0) - 1;
      expect([s.kind[fx], s.defId[fx], s.owner[fx], s.team[fx]]).toEqual([EntityKind.effect, SUPER_DEF, 0, 0]);
      expect([s.x[fx], s.y[fx], s.w[fx], s.h[fx]]).toEqual([x, y, w, h]);
    }
  });

  it('hits 5 times, every 6 game ticks, as strength 3 super hits of 12 scaled 1000/1000/900/800/700, then ends', () => {
    const world = duel('sindarosa', 'pax');
    const s = world.state;
    s.hp[1] = 10_000;
    const g0 = now(s);
    const ev = [...run(world, 1, SUPER), ...run(world, 200)];
    const hits = of(ev, SimEventKind.hitConfirmed) as (SimEvent & { g: number })[];
    expect(hits.map((h) => h.g - g0 - 1)).toEqual([0, 6, 12, 18, 24]);
    expect(hits.map((h) => h['scalePm'])).toEqual([1000, 1000, 900, 800, 700]);
    expect(hits.map((h) => [h['strength'], h['ability'], h['combo'], h['attacker'], h['target']])).toEqual(
      [1, 2, 3, 4, 5].map((c) => [HitStrength.super, SUPER_DEF, c, 0, 1]),
    );
    const raw = computeDamage({ base: 12, attackerMult: s.dmgMult[0] ?? 1, attEl: 'fire', defEl: 'earth', defReductionPct: 0 });
    expect(hits[0]?.['amount']).toBe(raw);
    expect(hits[2]?.['amount']).toBe((raw * 900) / 1000);
    const ended = of(ev, SimEventKind.superEnded) as (SimEvent & { g: number })[];
    expect(ended.map((e) => [e.g - g0 - 1, e['caster']])).toEqual([[SUPER_ACTIVE_TICKS, 0]]);
    expect(s.arcade[SUPER_STATE(0)]).toBe(0);
  });

  it('inside a live combo its hits keep the 600 pm floor', () => {
    const world = duel();
    const s = world.state;
    s.hp[1] = 10_000;
    step(world, SUPER);
    s.arcade[ARCADE_TEAM_BASE + ArcadeT.comboHits] = 6;
    s.arcade[1 * ARCADE_E + ArcadeE.stunUntil] = now(s) + 20;
    s.arcade[1 * ARCADE_E + ArcadeE.comboStunTotal] = 20;
    const hit = of(run(world, SUPER_FREEZE_TICKS + 1), SimEventKind.hitConfirmed)[0];
    expect([hit?.['combo'], hit?.['scalePm']]).toEqual([7, 600]);
  });

  it('misses a victim outside the band, a translucent one and an invulnerable one', () => {
    for (const set of [
      (w: SimWorld) => { w.state.y[1] = 100; },
      (w: SimWorld) => { w.state.flags[1] = (w.state.flags[1] ?? 0) | EntityFlag.translucent; },
      (w: SimWorld) => { w.state.arcade[1 * ARCADE_E + ArcadeE.invulnUntil] = 1000; },
    ]) {
      const world = duel();
      set(world);
      const ev = run(world, 1 + SUPER_FREEZE_TICKS + SUPER_ACTIVE_TICKS + 1, SUPER);
      expect(of(ev, SimEventKind.hitConfirmed)).toEqual([]);
      expect(of(ev, SimEventKind.superEnded)).toHaveLength(1);
    }
  });

  it.each(RACES)('%s has the Elemental Burst', (race) => {
    const world = duel(race, race === 'pax' ? 'rokcore' : 'pax');
    world.state.hp[1] = 10_000;
    expect(of(run(world, 10), SimEventKind.superStarted)).toEqual([]); // nothing without the button
    const sup = [...run(world, 1, SUPER), ...run(world, 200)];
    expect(of(sup, SimEventKind.superStarted)[0]?.['superId']).toBe(SUPER_ELEMENTAL_BURST);
    expect(of(sup, SimEventKind.hitConfirmed)).toHaveLength(5);
    expect(of(sup, SimEventKind.superEnded)).toHaveLength(1);
  });
});

describe('KO during a super', () => {
  it('a hit that KOs the victim takes the KO stop and ends the super at once, before the death and the round KO', () => {
    const world = duel();
    const s = world.state;
    s.hp[1] = 1;
    const ev = run(world, 1 + SUPER_FREEZE_TICKS + 1, SUPER);
    const tail = ev.slice(ev.findIndex((e) => e.kind === SimEventKind.hitConfirmed));
    const kinds = tail.filter((e) => e.kind !== SimEventKind.meterLevel && e.kind !== SimEventKind.damage).map((e) => e.kind);
    expect(kinds).toEqual([
      SimEventKind.hitConfirmed, SimEventKind.hitStop, SimEventKind.superEnded, SimEventKind.died, SimEventKind.ko,
    ]);
    expect(of(tail, SimEventKind.hitStop)[0]).toMatchObject({ ticks: KO_HIT_STOP_TICKS, cause: HitStopCause.ko });
    expect(s.arcade[SUPER_STATE(0)]).toBe(0);
    expect(of(run(world, KO_HIT_STOP_TICKS + 2), SimEventKind.superEnded)).toEqual([]);
  });

  it('a KO of the caster ends its super on the next tick; the incoming teammate is not locked', () => {
    const world = duel('sindarosa', 'pax', METER_BAR, true, ['lavax']);
    const s = world.state;
    s.y[2] = 100;
    run(world, 1 + SUPER_FREEZE_TICKS + SUPER_INVULN_AFTER_TICKS + 1, SUPER);
    s.hp[0] = 0;
    const ev = run(world, 2);
    expect(ev.map((e) => e.kind)).toEqual(expect.arrayContaining([SimEventKind.died, SimEventKind.superEnded]));
    expect(of(ev, SimEventKind.superEnded)[0]?.['caster']).toBe(0);
    expect(s.arcade[SUPER_STATE(0)]).toBe(0);
    expect(canAct(world, 1)).toBe(true);
  });
});

describe('super determinism', () => {
  const script = (i: number): readonly [Command, Command] => [i % 7 === 0 ? Cmd.super | Cmd.primary : Cmd.right, i % 5 === 0 ? Cmd.super : Cmd.left];
  const play = (world: SimWorld, from: number, to: number): number[] => {
    const out: number[] = [];
    for (let i = from; i < to; i++) {
      step(world, script(i));
      out.push(hash(world.state));
    }
    return out;
  };
  const setup = (): SimWorld => {
    const world = duel('lavax', 'curomo', 3 * METER_BAR);
    world.state.arcade[METER(1)] = 3 * METER_BAR;
    return world;
  };

  it('replays to the same hashes, and a snapshot taken mid-super restores to the same future', () => {
    const a = play(setup(), 0, 400);
    expect(play(setup(), 0, 400)).toEqual(a);
    for (const cut of [1, 20, 60, 90]) {
      const world = setup();
      play(world, 0, cut);
      expect(world.state.arcade[SUPER_STATE(0)]).not.toBe(0);
      const buf = createSnapshotBuf(world.state);
      snapshot(world.state, buf);
      const first = play(world, cut, 400);
      restore(world.state, buf);
      expect(play(world, cut, 400)).toEqual(first);
      expect(first).toEqual(a.slice(cut));
    }
  });
});
