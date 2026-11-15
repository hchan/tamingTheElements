import { describe, expect, it } from 'vitest';
import { OT_RIDERS, OT_SPECS, OtEnd, OtKind, Weather } from '../../../data/arcade';
import { ARCADE_WORLD_BASE, ArcadeW } from '../../state';
import { ALL_ABILITIES } from '../../../data/abilities-all';
import { characterId } from '../../../data/ids';
import { DEFAULT_SIM_FLAGS } from '../../../flags';
import { now } from '../../clock';
import { Cmd, type Command } from '../../commands';
import { EventSink, SimEventKind, type SimEvent } from '../../events';
import { createMatch, type MatchSetup } from '../../match';
import { step } from '../../step';
import type { SimWorld } from '../../world';
import { castSelf } from '../abilities';
import { hasStatus, StatusId } from '../status';
import { applyArcadeHit } from './hit';
import { applyOt, cleanseOt, healFactorPm, overTimeSystem } from './over-time';
import { chargedWeather, skipIntro } from './round-testkit';

const AW = (f: number): number => ARCADE_WORLD_BASE + f;
const IDLE: readonly [Command, Command] = [0, 0];
const def = (slug: string): number => ALL_ABILITIES.findIndex((d) => d.id === slug);
const of = (ev: readonly SimEvent[], kind: number): SimEvent[] => ev.filter((e) => e.kind === kind);

/** p1 (id 0) vs p2 (id 1), straight into the fight. */
function duel(on: boolean, p1 = 'fiara', p2 = 'pax'): SimWorld {
  const setup: MatchSetup = {
    simVersion: 75, seed: 9, flags: { ...DEFAULT_SIM_FLAGS, rulesetArcade: true, withOverTime: on }, chapter: 1, difficulty: 1,
    p1: [{ character: characterId(p1), xp: 1 }],
    p2: [{ character: characterId(p2), xp: 1 }],
  };
  const w = skipIntro(createMatch(setup));
  const s = w.state;
  s.x[0] = 300; s.y[0] = 300; s.dir[0] = 0;
  s.x[1] = 900; s.y[1] = 300; s.dir[1] = 4;
  return w;
}

const hitBy = (w: SimWorld, attacker: number, victim: number, slug: string): void => {
  applyArcadeHit(w, new EventSink(now(w.state)), attacker, attacker, victim, 5, def(slug), 0);
};

const burn = (w: SimWorld, id: number): void => {
  applyOt(w, new EventSink(now(w.state)), 1 - id, id, OtKind.burning);
};

/** Advances the game clock one tick and runs the over-time system; returns its events. */
const pulseTick = (w: SimWorld): SimEvent[] => {
  w.state.arcade[AW(ArcadeW.gameTick)] = now(w.state) + 1;
  const sk = new EventSink(now(w.state));
  overTimeSystem(w, null, sk);
  return [...sk.events];
};

const hpOf = (w: SimWorld, id = 0): number => w.state.hp[id] ?? 0;

const waterPatch = (w: SimWorld): void => {
  const a = w.state.arcade;
  a[AW(ArcadeW.stage)] = 2;
  a[AW(ArcadeW.patchCount)] = 1;
  a.set([260, 260, 160, 160], AW(ArcadeW.patches));
};

describe('OT3 venom rider', () => {
  it('the table names slime-blast and stinging-filament as venom, and both exist', () => {
    const venoms = OT_RIDERS.filter((r) => r.kind === OtKind.venom).map((r) => r.slug);
    expect(venoms).toEqual(['slime-blast', 'stinging-filament']);
    for (const slug of venoms) expect(def(slug)).toBeGreaterThanOrEqual(0);
  });

  it('flag on: both leave venom on a landed hit; flag off leaves nothing', () => {
    for (const slug of ['slime-blast', 'stinging-filament']) {
      const on = duel(true);
      hitBy(on, 0, 1, slug);
      expect(hasStatus(on.state, 1, StatusId.venom), slug).toBe(true);
      const off = duel(false);
      hitBy(off, 0, 1, slug);
      expect(hasStatus(off.state, 1, StatusId.venom), slug).toBe(false);
    }
  });

  it('venom pulses its damage every period, 5 times, never below 1 HP', () => {
    const w = duel(true);
    hitBy(w, 0, 1, 'slime-blast');
    const spec = OT_SPECS[OtKind.venom];
    w.state.hp[1] = 100;
    let pulses = 0;
    for (let i = 0; i < (spec?.durationTicks ?? 0) + 1; i++) pulses += of(pulseTick(w), SimEventKind.otPulse).length;
    expect(pulses).toBe(5);
    expect(w.state.hp[1]).toBe(100 - 5 * (spec?.amount ?? 0));
    const low = duel(true);
    hitBy(low, 0, 1, 'stinging-filament');
    low.state.hp[1] = 1;
    for (let i = 0; i < 260; i++) pulseTick(low);
    expect(low.state.hp[1]).toBe(1);
  });

  it('venom halves a heal ability and its mending pulses', () => {
    const clean = duel(true);
    const sick = duel(true);
    clean.state.hp[0] = 20;
    sick.state.hp[0] = 20;
    applyOt(sick, new EventSink(now(sick.state)), 1, 0, OtKind.venom);
    expect(healFactorPm(sick.state, 0)).toBe(500);
    castSelf(clean, new EventSink(now(clean.state)), 0, 0, now(clean.state));
    castSelf(sick, new EventSink(now(sick.state)), 0, 0, now(sick.state));
    const cleanGain = hpOf(clean) - 20;
    const sickGain = hpOf(sick) - 20;
    expect(cleanGain).toBeGreaterThan(0);
    expect(sickGain).toBe(Math.trunc(cleanGain / 2));
    // First pulse tick: the mending pulse is +2 clean, +1 under venom (the venom's own DoT is separate: it started the same tick).
    const c0 = hpOf(clean);
    const evs: SimEvent[] = [];
    for (let i = 0; i < 50; i++) evs.push(...pulseTick(sick));
    for (let i = 0; i < 50; i++) pulseTick(clean);
    expect(hpOf(clean) - c0).toBe(2);
    const mendPulse = of(evs, SimEventKind.otPulse).filter((e) => e['heal'] === 1);
    expect(mendPulse).toMatchObject([{ amount: 1 }]);
  });

  it('venom halves the water patch heal', () => {
    const run = (venom: boolean): number => {
      const w = duel(true, 'curomo', 'sindarosa');
      waterPatch(w);
      w.state.hp[0] = (w.state.maxHp[0] ?? 0) / 2;
      if (venom) applyOt(w, new EventSink(now(w.state)), 1, 0, OtKind.venom);
      let heal = 0;
      for (let i = 0; i < 60; i++) heal += of(step(w, IDLE), SimEventKind.patchHeal).reduce((n, e) => n + Number(e['amount']), 0);
      return heal;
    };
    const full = run(false);
    const half = run(true);
    expect(full).toBeGreaterThan(0);
    expect(half).toBeGreaterThan(0);
    expect(half).toBeLessThanOrEqual(full / 2 + 1);
  });

  it('cleanse ends venom with otEnded cleansed', () => {
    const w = duel(true);
    hitBy(w, 0, 1, 'slime-blast');
    const sk = new EventSink(now(w.state));
    expect(cleanseOt(w, sk, 1)).toBe(1);
    expect(hasStatus(w.state, 1, StatusId.venom)).toBe(false);
    expect([...sk.events].filter((e) => e.kind === SimEventKind.otEnded)).toMatchObject([{ status: StatusId.venom, reason: OtEnd.cleansed }]);
  });
});

describe('OT3 water douse of burning', () => {
  it('a water patch tick douses the standing hero, even at full HP', () => {
    const w = duel(true, 'curomo', 'sindarosa');
    waterPatch(w);
    burn(w, 0);
    expect(hasStatus(w.state, 0, StatusId.burning)).toBe(true);
    const ev: SimEvent[] = [];
    for (let i = 0; i < 60 && hasStatus(w.state, 0, StatusId.burning); i++) ev.push(...step(w, IDLE));
    expect(hasStatus(w.state, 0, StatusId.burning)).toBe(false);
    expect(of(ev, SimEventKind.otEnded)).toMatchObject([{ status: StatusId.burning, reason: OtEnd.cleansed }]);
  });

  it('Rain starting douses every burning hero; other weather does not', () => {
    const rain = chargedWeather(duel(true, 'curomo', 'sindarosa'));
    burn(rain, 0);
    burn(rain, 1);
    const ev = step(rain, [Cmd.weather, 0]);
    expect(of(ev, SimEventKind.weatherChanged)).toMatchObject([{ weather: Weather.rain }]);
    expect(hasStatus(rain.state, 0, StatusId.burning)).toBe(false);
    expect(hasStatus(rain.state, 1, StatusId.burning)).toBe(false);
    const sun = chargedWeather(duel(true, 'sindarosa', 'curomo'));
    burn(sun, 0);
    step(sun, [Cmd.weather, 0]);
    expect(hasStatus(sun.state, 0, StatusId.burning)).toBe(true);
  });

  it('a Puddle trap triggered by the burning foe douses it', () => {
    const w = duel(true, 'curomo', 'pax');
    step(w, [Cmd.trap, 0]);
    for (let i = 0; i < 35; i++) step(w, IDLE);
    burn(w, 1);
    w.state.x[1] = 420;
    step(w, IDLE);
    expect(hasStatus(w.state, 1, StatusId.burning)).toBe(false);
  });
});
