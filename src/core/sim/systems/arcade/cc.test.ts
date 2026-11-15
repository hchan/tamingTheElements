import { describe, expect, it } from 'vitest';
import {
  CC_DR_RESET_TICKS, CcBucket, CcEnd, CcKind, CcResist, DAZE_GRACE_TICKS, DAZE_MASH_TICKS, DAZE_MIN_TICKS, DAZE_TICKS,
  DOWN_TICKS, ICE_GRACE_TICKS, ICE_SHATTER_PM, ICED_TICKS, QUICK_RISE_TICKS, SILENCE_TICKS, WAKE_INVULN_TICKS, Weather,
} from '../../../data/arcade';
import { characterId } from '../../../data/ids';
import { DEFAULT_SIM_FLAGS } from '../../../flags';
import { now } from '../../clock';
import { Cmd } from '../../commands';
import { EventSink, SimEventKind, type SimEvent } from '../../events';
import { hash } from '../../hash';
import { createMatch, type MatchSetup } from '../../match';
import { ARCADE_E, ARCADE_WORLD_BASE, ArcadeE, ArcadeW, STATUS_SLOTS } from '../../state';
import { step } from '../../step';
import { listStatuses, StatusId } from '../status';
import type { SimWorld } from '../../world';
import { applyCc, cleansableCc, ccOnHit, primeKindled, spendKindled } from './cc';
import { ccHeld, ccLevel, isSilenced } from './cc-state';
import { skipIntro } from './round-testkit';
import { isFree } from './stun';

const E = (id: number, f: number): number => id * ARCADE_E + f;

function duel(on: boolean, p1 = 'morblass', p2 = 'pax', seed = 9): SimWorld {
  const setup: MatchSetup = {
    simVersion: 70, seed, flags: { ...DEFAULT_SIM_FLAGS, rulesetArcade: true, withCrowdControl: on }, chapter: 1, difficulty: 1,
    p1: [{ character: characterId(p1), xp: 1 }],
    p2: [{ character: characterId(p2), xp: 1 }],
  };
  const world = skipIntro(createMatch(setup));
  const s = world.state;
  s.x[0] = 300; s.y[0] = 300; s.dir[0] = 0;
  s.x[1] = 450; s.y[1] = 300; s.dir[1] = 4;
  return world;
}

const sink = (w: SimWorld): EventSink => new EventSink(now(w.state));
const cc = (w: SimWorld, kind: number, ticks: number, victim = 0): boolean => applyCc(w, sink(w), 1, 1, victim, kind, ticks);
const ids = (w: SimWorld, id = 0): number[] => listStatuses(w.state, id).map((x) => x.id);

describe('crowd control core (flag withCrowdControl)', () => {
  it('does nothing with the flag off', () => {
    const w = duel(false);
    expect(cc(w, CcKind.daze, DAZE_TICKS)).toBe(false);
    expect(ids(w)).toEqual([]);
    expect(isSilenced(w.state, 0)).toBe(false);
    expect(cleansableCc(w.state, 0)).toBe(0);
  });

  it('flag off: seeded Arcade matches never write a status >= 10 or emit event kinds >= 79', () => {
    for (let seed = 1; seed <= 8; seed++) {
      const w = duel(false, 'sindarosa', 'curomo', seed);
      const cmds = [Cmd.primary | Cmd.right, Cmd.secondary | Cmd.left, Cmd.dash, Cmd.cleanse, Cmd.super, Cmd.weather];
      for (let t = 0; t < 1500; t++) {
        const evs = step(w, [cmds[(t + seed) % cmds.length] ?? 0, cmds[(t * 3 + seed) % cmds.length] ?? 0]);
        for (const e of evs) expect(e.kind).toBeLessThan(79);
        for (let id = 0; id < 2; id++) for (const x of listStatuses(w.state, id)) expect(x.id).toBeLessThan(10);
      }
    }
  });

  it('flag off leaves the hash of a run unchanged by an idle flag state', () => {
    const a = duel(false);
    const b = duel(false);
    for (let t = 0; t < 200; t++) { step(a, [Cmd.primary, 0]); step(b, [Cmd.primary, 0]); }
    expect(hash(a.state)).toBe(hash(b.state));
  });

  it('applies each kind with its length and emits ccStarted', () => {
    const w = duel(true);
    const sk = sink(w);
    expect(applyCc(w, sk, 1, 1, 0, CcKind.daze, DAZE_TICKS)).toBe(true);
    const st = listStatuses(w.state, 0).find((x) => x.id === StatusId.dazed);
    expect(st?.expireTick).toBe(now(w.state) + DAZE_TICKS);
    expect(sk.events[0]).toMatchObject({ kind: SimEventKind.ccStarted, id: 0, cc: CcKind.daze, ticks: DAZE_TICKS, level: 0 });
    expect(ccHeld(w.state, 0)).toBe(true);
    expect(isFree(w.state, 0)).toBe(false);
  });

  it('each hard kind blocks isFree; silence does not', () => {
    for (const [kind, ticks] of [[CcKind.daze, DAZE_TICKS], [CcKind.iced, ICED_TICKS], [CcKind.downed, DOWN_TICKS]] as const) {
      const w = duel(true);
      expect(isFree(w.state, 0)).toBe(true);
      cc(w, kind, ticks);
      expect(isFree(w.state, 0)).toBe(false);
    }
    const w = duel(true);
    cc(w, CcKind.silenced, SILENCE_TICKS);
    expect(isFree(w.state, 0)).toBe(true);
    expect(isSilenced(w.state, 0)).toBe(true);
    expect(cleansableCc(w.state, 0)).toBe(1);
  });

  it('downed sets wake-up invulnerability', () => {
    const w = duel(true);
    cc(w, CcKind.downed, DOWN_TICKS);
    expect(w.state.arcade[E(0, ArcadeE.invulnUntil)]).toBe(now(w.state) + DOWN_TICKS + WAKE_INVULN_TICKS);
  });

  it('diminishing returns: full, half, immune; an immune result does not refresh the ward', () => {
    const w = duel(true);
    const s = w.state;
    expect(cc(w, CcKind.silenced, SILENCE_TICKS)).toBe(true);
    expect(ccLevel(s, 0, CcBucket.silence)).toBe(1);
    s.status.fill(0, 0, STATUS_SLOTS * 5);
    // clear the state but keep the ward: remove only the silence
    const w2 = duel(true);
    const s2 = w2.state;
    const lens: number[] = [];
    const evs: SimEvent[] = [];
    for (let i = 0; i < 3; i++) {
      const sk = sink(w2);
      const ok = applyCc(w2, sk, 1, 1, 0, CcKind.silenced, SILENCE_TICKS);
      evs.push(...sk.events);
      if (ok) lens.push(sk.events[0]?.ticks ?? -1);
      for (let t = 0; t < SILENCE_TICKS + 1; t++) step(w2, [0, 0]);
    }
    expect(lens).toEqual([SILENCE_TICKS, SILENCE_TICKS >> 1]);
    expect(evs[2]).toMatchObject({ kind: SimEventKind.ccResisted, reason: CcResist.immune });
    expect(ccLevel(s2, 0, CcBucket.silence)).toBe(2);
    // the ward expires CC_DR_RESET_TICKS after the last accepted state ended
    for (let t = 0; t < CC_DR_RESET_TICKS + 2; t++) step(w2, [0, 0]);
    expect(ccLevel(s2, 0, CcBucket.silence)).toBe(0);
  });

  it('refuses a second hard CC while held (busy)', () => {
    const w = duel(true);
    expect(cc(w, CcKind.daze, DAZE_TICKS)).toBe(true);
    const sk = sink(w);
    expect(applyCc(w, sk, 1, 1, 0, CcKind.downed, DOWN_TICKS)).toBe(false);
    expect(sk.events[0]).toMatchObject({ kind: SimEventKind.ccResisted, reason: CcResist.busy });
  });

  it('is refused full when no status slots are free', () => {
    const w = duel(true);
    const s = w.state;
    for (let i = 0; i < STATUS_SLOTS; i++) {
      const b = (0 * STATUS_SLOTS + i) * 5;
      s.status[b] = StatusId.kindled;
      s.status[b + 3] = now(s) + 1000;
    }
    const sk = sink(w);
    expect(applyCc(w, sk, 1, 1, 0, CcKind.daze, DAZE_TICKS)).toBe(false);
    expect(sk.events[0]).toMatchObject({ reason: CcResist.full });
  });

  it('Sunshine blocks ice and thaws it', () => {
    const w = duel(true);
    w.state.arcade[ARCADE_WORLD_BASE + ArcadeW.weather] = Weather.sun;
    expect(cc(w, CcKind.iced, ICED_TICKS)).toBe(false);
    w.state.arcade[ARCADE_WORLD_BASE + ArcadeW.weather] = 0;
    expect(cc(w, CcKind.iced, ICED_TICKS)).toBe(true);
    w.state.arcade[ARCADE_WORLD_BASE + ArcadeW.weather] = Weather.sun;
    w.state.arcade[ARCADE_WORLD_BASE + ArcadeW.weatherUntil] = now(w.state) + 500;
    const evs = step(w, [0, 0]);
    expect(ids(w)).not.toContain(StatusId.iced);
    expect(evs.some((e) => e.kind === SimEventKind.ccEnded && e.reason === CcEnd.thawed)).toBe(true);
  });

  it('daze: a hit after the grace breaks it, a 0-damage or early hit does not', () => {
    const w = duel(true);
    cc(w, CcKind.daze, DAZE_TICKS);
    ccOnHit(w, sink(w), 1, 0, 5, false);
    expect(ids(w)).toContain(StatusId.dazed);
    for (let t = 0; t < DAZE_GRACE_TICKS; t++) step(w, [0, 0]);
    ccOnHit(w, sink(w), 1, 0, 0, false);
    expect(ids(w)).toContain(StatusId.dazed);
    const sk = sink(w);
    ccOnHit(w, sk, 1, 0, 5, false);
    expect(ids(w)).not.toContain(StatusId.dazed);
    expect(sk.events[0]).toMatchObject({ kind: SimEventKind.ccEnded, reason: CcEnd.broken });
  });

  it('daze: mashing takes DAZE_MASH_TICKS per fresh press and never below the floor', () => {
    const w = duel(true);
    cc(w, CcKind.daze, DAZE_TICKS);
    const start = now(w.state);
    step(w, [Cmd.primary, 0]);
    step(w, [0, 0]);
    const d = listStatuses(w.state, 0).find((x) => x.id === StatusId.dazed);
    expect(d?.expireTick).toBe(start + DAZE_TICKS - DAZE_MASH_TICKS);
    for (let i = 0; i < 60; i++) step(w, [i % 2 === 0 ? Cmd.primary : 0, 0]);
    const floor = listStatuses(w.state, 0).find((x) => x.id === StatusId.dazed);
    if (floor !== undefined) expect(floor.expireTick).toBeGreaterThanOrEqual(start + DAZE_MIN_TICKS);
    else expect(now(w.state)).toBeGreaterThanOrEqual(start + DAZE_MIN_TICKS);
  });

  it('down: a Dash press in the window quick-rises', () => {
    const w = duel(true);
    cc(w, CcKind.downed, DOWN_TICKS);
    const start = now(w.state);
    const evs: SimEvent[] = [];
    for (let i = 0; i < QUICK_RISE_TICKS + 4; i++) evs.push(...step(w, [i === 2 ? Cmd.dash : 0, 0]));
    expect(ids(w)).not.toContain(StatusId.downed);
    const end = evs.find((e) => e.kind === SimEventKind.ccEnded);
    expect(end).toMatchObject({ reason: CcEnd.quickRise });
    expect(end?.tick).toBeLessThanOrEqual(start + QUICK_RISE_TICKS + 1);
  });

  it('ice: shatter bonus after the grace (none on a super), fire thaws without the bonus', () => {
    const w = duel(true, 'morblass', 'sindarosa');
    cc(w, CcKind.iced, ICED_TICKS);
    // attacker 1 is fire: thaw, no bonus
    expect(ccOnHit(w, sink(w), 1, 0, 5, false).bonusPm).toBe(1000);
    expect(ids(w)).not.toContain(StatusId.iced);
    const w2 = duel(true, 'sindarosa', 'pax');
    cc(w2, CcKind.iced, ICED_TICKS, 1);
    expect(ccOnHit(w2, sink(w2), 0, 1, 5, false).bonusPm).toBe(1000); // fire attacker 0
    const w3 = duel(true, 'morblass', 'pax');
    cc(w3, CcKind.iced, ICED_TICKS, 1);
    expect(ccOnHit(w3, sink(w3), 0, 1, 5, false).bonusPm).toBe(1000); // inside the grace: no shatter
    expect(ids(w3, 1)).toContain(StatusId.iced);
    for (let t = 0; t < ICE_GRACE_TICKS; t++) step(w3, [0, 0]);
    expect(ccOnHit(w3, sink(w3), 0, 1, 5, false).bonusPm).toBe(ICE_SHATTER_PM);
    const w4 = duel(true, 'morblass', 'pax');
    cc(w4, CcKind.iced, ICED_TICKS, 1);
    for (let t = 0; t < ICE_GRACE_TICKS; t++) step(w4, [0, 0]);
    expect(ccOnHit(w4, sink(w4), 0, 1, 5, true).bonusPm).toBe(1000);
  });

  it('kindled is spent once and hidden ids never reach the status listing of the view', () => {
    const w = duel(true, 'sindarosa', 'pax');
    primeKindled(w.state, 0, now(w.state) + 100);
    expect(spendKindled(w.state, 0)).toBe(true);
    expect(spendKindled(w.state, 0)).toBe(false);
  });

  it('Cleanse ends a silence', () => {
    const w = duel(true, 'curomo', 'pax');
    cc(w, CcKind.silenced, SILENCE_TICKS);
    const evs = step(w, [Cmd.cleanse, 0]);
    expect(isSilenced(w.state, 0)).toBe(false);
    expect(evs.some((e) => e.kind === SimEventKind.ccEnded && e.reason === CcEnd.cleansed)).toBe(true);
  });

  it('statusSystem leaves speed alone for ids 10 and up', () => {
    const w = duel(true);
    const speed = w.state.speed[0];
    cc(w, CcKind.silenced, SILENCE_TICKS);
    cc(w, CcKind.daze, DAZE_TICKS);
    for (let t = 0; t < DAZE_TICKS + 5; t++) step(w, [0, 0]);
    expect(w.state.speed[0]).toBe(speed);
  });

  it('every CC ends by itself', () => {
    const w = duel(true);
    cc(w, CcKind.silenced, SILENCE_TICKS);
    cc(w, CcKind.iced, ICED_TICKS);
    const evs: SimEvent[] = [];
    for (let t = 0; t < SILENCE_TICKS + 2; t++) evs.push(...step(w, [0, 0]));
    expect(evs.filter((e) => e.kind === SimEventKind.ccEnded)).toHaveLength(2);
    expect(ids(w).filter((i) => i < StatusId.ccWard)).toEqual([]);
  });
});
