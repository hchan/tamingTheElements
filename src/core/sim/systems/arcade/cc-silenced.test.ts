import { describe, expect, it } from 'vitest';
import {
  CC_DR_RESET_TICKS, CC_RIDERS, CcEnd, CcKind, CcResist, ELEMENTAL_TICKS, SILENCE_TICKS, WEATHER_CHARGE_FULL,
} from '../../../data/arcade';
import { ALL_ABILITIES } from '../../../data/abilities-all';
import { characterId } from '../../../data/ids';
import { DEFAULT_SIM_FLAGS } from '../../../flags';
import { now } from '../../clock';
import { Cmd } from '../../commands';
import { EventSink, SimEventKind, type SimEvent } from '../../events';
import { hash } from '../../hash';
import { createMatch, type MatchSetup } from '../../match';
import { ARCADE_E, ARCADE_T, ARCADE_TEAM_BASE, ArcadeE, ArcadeT, MAX_ENTITIES } from '../../state';
import { step } from '../../step';
import { hasStatus, listStatuses, StatusId } from '../status';
import type { SimWorld } from '../../world';
import { applyCc } from './cc';
import { isSilenced } from './cc-state';
import { applyArcadeHit, SUPER_DEF } from './hit';
import { gainMeter } from './meter';
import { skipIntro } from './round-testkit';
import { isFree } from './stun';

const DEFS = ALL_ABILITIES;
const PLAIN = DEFS.findIndex((d) => d.id === 'fireball');
const E = (id: number, f: number): number => id * ARCADE_E + f;
const ATT = 0;
const VICTIM = 1;

/** Sindarosa (fire, id 0) against Pax (earth, melee, id 1), flag on or off. */
function duel(on: boolean, p2 = 'pax', seed = 9): SimWorld {
  const setup: MatchSetup = {
    simVersion: 70, seed, flags: { ...DEFAULT_SIM_FLAGS, rulesetArcade: true, withCrowdControl: on }, chapter: 1, difficulty: 1,
    p1: [{ character: characterId('sindarosa'), xp: 1 }],
    p2: [{ character: characterId(p2), xp: 1 }],
  };
  const w = skipIntro(createMatch(setup));
  const s = w.state;
  s.x[0] = 300; s.y[0] = 300; s.dir[0] = 0;
  s.x[1] = 900; s.y[1] = 300; s.dir[1] = 4;
  return w;
}

const hit = (w: SimWorld, d = PLAIN, att = ATT, victim = VICTIM): SimEvent[] => {
  const sk = new EventSink(now(w.state));
  applyArcadeHit(w, sk, att, att, victim, 10, d, 0);
  return [...sk.events];
};
const has = (w: SimWorld, id: number, sid: number): boolean => hasStatus(w.state, id, sid);
/** Steps n GAME ticks (hit-stop freezes the game clock). */
const run = (w: SimWorld, n: number): void => { const end = now(w.state) + n; for (let i = 0; i < n + 200 && now(w.state) < end; i++) step(w, [0, 0]); };
const runEv = (w: SimWorld, n: number): SimEvent[] => {
  const out: SimEvent[] = [];
  const end = now(w.state) + n;
  for (let i = 0; i < n + 200 && now(w.state) < end; i++) out.push(...step(w, [0, 0]));
  return out;
};
/** Steps until `id` is free again (hit stun over); the silence (60 ticks) must outlast it. */
const untilFree = (w: SimWorld, id = VICTIM): void => { for (let i = 0; i < 200 && !isFree(w.state, id); i++) step(w, [0, 0]); };
/** `id` casts its elemental by a real press. */
function ember(w: SimWorld, id = ATT): void {
  step(w, (w.state.team[id] ?? 0) === 0 ? [Cmd.elemental, 0] : [0, Cmd.elemental]);
}

describe('CB4 silenced: the Ember prime (Smother)', () => {
  it('the table has no silence rider: the prime is on Ember, not on an ability', () => {
    expect(CC_RIDERS.some((r) => r.kind === CcKind.silenced)).toBe(false);
  });

  it('flag off: Ember writes no kindled, a hit silences nothing, no CC event', () => {
    const w = duel(false);
    ember(w);
    expect(w.state.arcade[E(ATT, ArcadeE.elemUntil)]).toBeGreaterThan(now(w.state));
    expect(has(w, ATT, StatusId.kindled)).toBe(false);
    const evs = hit(w);
    expect(has(w, VICTIM, StatusId.silenced)).toBe(false);
    expect(isSilenced(w.state, VICTIM)).toBe(false);
    for (const e of evs) expect(e.kind).toBeLessThan(79);
  });

  it('flag on: Ember primes the caster until the buff ends', () => {
    const w = duel(true);
    const g = now(w.state);
    ember(w);
    expect(has(w, ATT, StatusId.kindled)).toBe(true);
    expect(w.state.arcade[E(ATT, ArcadeE.elemUntil)]).toBe(g + ELEMENTAL_TICKS);
  });

  it('only a fire Ember primes: an earth elemental casts but never primes', () => {
    const w = duel(true);
    ember(w, VICTIM);
    expect(w.state.arcade[E(VICTIM, ArcadeE.elemUntil)]).toBeGreaterThan(0);
    expect(has(w, VICTIM, StatusId.kindled)).toBe(false);
  });

  it('the first landed hit silences the victim for SILENCE_TICKS, spends the prime and emits ccStarted', () => {
    const w = duel(true);
    ember(w);
    const g = now(w.state);
    const evs = hit(w);
    expect(has(w, ATT, StatusId.kindled)).toBe(false);
    expect(isSilenced(w.state, VICTIM)).toBe(true);
    expect(listStatuses(w.state, VICTIM).find((x) => x.id === StatusId.silenced)?.expireTick).toBe(g + SILENCE_TICKS);
    expect(evs.find((e) => e.kind === SimEventKind.ccStarted)).toMatchObject({ id: VICTIM, cc: CcKind.silenced, ticks: SILENCE_TICKS, source: ATT, level: 0 });
  });

  it('once spent, a second hit starts or resists nothing', () => {
    const w = duel(true);
    ember(w);
    hit(w);
    const evs = hit(w);
    expect(evs.some((e) => e.kind === SimEventKind.ccStarted || e.kind === SimEventKind.ccResisted)).toBe(false);
  });

  it('never on a super: a super hit neither silences nor spends the prime', () => {
    const w = duel(true);
    ember(w);
    hit(w, SUPER_DEF);
    expect(isSilenced(w.state, VICTIM)).toBe(false);
    expect(has(w, ATT, StatusId.kindled)).toBe(true);
    hit(w);
    expect(isSilenced(w.state, VICTIM)).toBe(true);
  });

  it('a guarded hit spends the prime and silences nothing', () => {
    const w = duel(true);
    ember(w);
    for (let i = 0; i < 14; i++) step(w, [0, Cmd.guard]);
    hit(w);
    expect(has(w, ATT, StatusId.kindled)).toBe(false);
    expect(isSilenced(w.state, VICTIM)).toBe(false);
  });

  it('a parried hit spends the prime and silences nothing', () => {
    const w = duel(true);
    ember(w);
    w.state.arcade[E(VICTIM, ArcadeE.parryUntil)] = now(w.state) + 6;
    hit(w);
    expect(has(w, ATT, StatusId.kindled)).toBe(false);
    expect(isSilenced(w.state, VICTIM)).toBe(false);
  });

  it('the prime lapses with the Ember buff: a late hit silences nothing', () => {
    const w = duel(true);
    ember(w);
    run(w, ELEMENTAL_TICKS + 2);
    expect(has(w, ATT, StatusId.kindled)).toBe(false);
    hit(w);
    expect(isSilenced(w.state, VICTIM)).toBe(false);
  });

  it('expiry ends the silence as expired', () => {
    const w = duel(true);
    ember(w);
    hit(w);
    const evs = runEv(w, SILENCE_TICKS + 2);
    expect(evs.find((e) => e.kind === SimEventKind.ccEnded)).toMatchObject({ id: VICTIM, cc: CcKind.silenced, reason: CcEnd.expired });
    expect(isSilenced(w.state, VICTIM)).toBe(false);
  });

  it('re-hit: a second primed hit on a silenced victim is resisted busy and the silence stays single', () => {
    const w = duel(true);
    ember(w);
    hit(w);
    run(w, 3);
    w.state.arcade[E(ATT, ArcadeE.elemReadyAt)] = 0;
    ember(w);
    expect(has(w, ATT, StatusId.kindled)).toBe(true);
    const evs = hit(w);
    expect(evs.find((e) => e.kind === SimEventKind.ccResisted)).toMatchObject({ id: VICTIM, cc: CcKind.silenced, reason: CcResist.busy });
    expect(listStatuses(w.state, VICTIM).filter((x) => x.id === StatusId.silenced)).toHaveLength(1);
    expect(has(w, ATT, StatusId.kindled)).toBe(false);
  });

  it('DR: back-to-back silences are 60, 30, immune, then reset', () => {
    const w = duel(true);
    const lens: number[] = [];
    let immune = false;
    for (let k = 0; k < 3; k++) {
      const sk = new EventSink(now(w.state));
      applyCc(w, sk, ATT, ATT, VICTIM, CcKind.silenced, SILENCE_TICKS);
      const st = sk.events.find((e) => e.kind === SimEventKind.ccStarted);
      if (st !== undefined) lens.push(st.ticks as number);
      if (sk.events.some((e) => e.kind === SimEventKind.ccResisted && e.reason === CcResist.immune)) immune = true;
      run(w, SILENCE_TICKS + 1);
    }
    expect(lens).toEqual([SILENCE_TICKS, SILENCE_TICKS >> 1]);
    expect(immune).toBe(true);
    run(w, CC_DR_RESET_TICKS + 2);
    const sk = new EventSink(now(w.state));
    expect(applyCc(w, sk, ATT, ATT, VICTIM, CcKind.silenced, SILENCE_TICKS)).toBe(true);
    expect(sk.events[0]).toMatchObject({ kind: SimEventKind.ccStarted, level: 0 });
  });

  it('Cleanse ends the silence, with ccEnded cleansed', () => {
    const w = duel(true);
    ember(w);
    hit(w);
    untilFree(w); // Cleanse needs a free hero
    expect(isSilenced(w.state, VICTIM)).toBe(true);
    const evs = step(w, [0, Cmd.cleanse]);
    expect(isSilenced(w.state, VICTIM)).toBe(false);
    expect(evs.find((e) => e.kind === SimEventKind.ccEnded)).toMatchObject({ cc: CcKind.silenced, reason: CcEnd.cleansed });
  });

  it('a silenced water hero cannot use its elemental Cleanse, but the common Cleanse works', () => {
    const w = duel(true, 'morblass');
    ember(w);
    hit(w);
    untilFree(w);
    const evs = step(w, [0, Cmd.elemental]);
    expect(evs.some((e) => e.kind === SimEventKind.elementalCast)).toBe(false);
    expect(isSilenced(w.state, VICTIM)).toBe(true);
    step(w, [0, Cmd.cleanse]);
    expect(isSilenced(w.state, VICTIM)).toBe(false);
  });

  it('flag on: the same seeded script replays identically twice', () => {
    const hashes: number[][] = [];
    for (let rep = 0; rep < 2; rep++) {
      const w = duel(true, 'pax', 3);
      const out: number[] = [];
      const cmds = [Cmd.elemental, Cmd.primary | Cmd.right, Cmd.secondary, Cmd.cleanse, Cmd.dash, Cmd.guard, Cmd.left, Cmd.weather];
      for (let t = 0; t < 600; t++) {
        step(w, [cmds[t % cmds.length] ?? 0, cmds[(t * 5 + 1) % cmds.length] ?? 0]);
        if (t % 50 === 0) out.push(hash(w.state));
      }
      hashes.push(out);
    }
    expect(hashes[0]).toEqual(hashes[1]);
  });
});

describe('CB4 silenced: only abilities are blocked', () => {
  /** What a press of `cmd` did to the victim (Pax, id 1) in one step, silenced (`on`) or not. */
  function probe(on: boolean, cmd: number): Record<string, boolean> {
    const w = duel(on);
    const s = w.state;
    s.x[1] = 300; s.y[1] = 300; s.x[0] = 1200; s.y[0] = 300; // the foe is far, so a Charge has a target
    gainMeter(s, new EventSink(now(s)), VICTIM, 1, 5000);
    s.arcade[ARCADE_TEAM_BASE + 1 * ARCADE_T + ArcadeT.weatherCharge] = WEATHER_CHARGE_FULL;
    if (on) applyCc(w, new EventSink(now(s)), ATT, ATT, VICTIM, CcKind.silenced, SILENCE_TICKS);
    const abilBefore = Array.from(s.abil);
    const x = s.x[1];
    const evs = step(w, [0, cmd]);
    const kinds = new Set(evs.map((e) => e.kind));
    return {
      silenced: isSilenced(s, VICTIM),
      ability: Array.from(s.abil).some((v, i) => v !== abilBefore[i]),
      elemental: kinds.has(SimEventKind.elementalCast),
      superStart: kinds.has(SimEventKind.superStarted),
      weather: kinds.has(SimEventKind.weatherChanged),
      dash: kinds.has(SimEventKind.dashed),
      charge: kinds.has(SimEventKind.chargeStarted),
      trap: kinds.has(SimEventKind.trapPlaced),
      moved: s.x[1] !== x,
    };
  }

  it('blocks exactly the ability gates: primary, secondary, elemental, super, weather', () => {
    const table: [number, string][] = [
      [Cmd.primary, 'ability'], [Cmd.secondary, 'ability'], [Cmd.elemental, 'elemental'], [Cmd.super, 'superStart'], [Cmd.weather, 'weather'],
    ];
    for (const [cmd, key] of table) {
      expect(probe(false, cmd)[key], `${key} works unsilenced`).toBe(true);
      expect(probe(true, cmd)[key], `${key} is blocked silenced`).toBe(false);
    }
  });

  it('silence leaves dash, Charge, trap and walking usable', () => {
    const table: [number, string][] = [[Cmd.dash, 'dash'], [Cmd.charge, 'charge'], [Cmd.trap, 'trap'], [Cmd.right, 'moved']];
    for (const [cmd, key] of table) {
      expect(probe(false, cmd)[key], `${key} works unsilenced`).toBe(true);
      const p = probe(true, cmd);
      expect(p['silenced']).toBe(true);
      expect(p[key], `${key} still works silenced`).toBe(true);
    }
  });

  it('silence leaves guard usable: a guarding silenced hero chips instead of being hit', () => {
    const w = duel(true);
    applyCc(w, new EventSink(now(w.state)), ATT, ATT, VICTIM, CcKind.silenced, SILENCE_TICKS);
    for (let i = 0; i < 14; i++) step(w, [0, Cmd.guard]);
    expect(isSilenced(w.state, VICTIM)).toBe(true);
    expect(hit(w).some((e) => e.kind === SimEventKind.guarded)).toBe(true);
  });

  it('2v2: a silenced front hero can tag out, and its partner is never silenced', () => {
    const setup: MatchSetup = {
      simVersion: 70, seed: 5, flags: { ...DEFAULT_SIM_FLAGS, rulesetArcade: true, withCrowdControl: true }, chapter: 1, difficulty: 1,
      p1: [{ character: characterId('sindarosa'), xp: 1 }, { character: characterId('curomo'), xp: 1 }],
      p2: [{ character: characterId('pax'), xp: 1 }, { character: characterId('morblass'), xp: 1 }],
    };
    const w = skipIntro(createMatch(setup));
    const s = w.state;
    const team1: number[] = [];
    for (let id = 0; id < MAX_ENTITIES; id++) if (s.maxHp[id] !== 0 && s.team[id] === 1) team1.push(id);
    const front = team1[0] ?? 0;
    const partner = team1[1] ?? 0;
    expect(team1).toHaveLength(2);
    ember(w, 0);
    hit(w, PLAIN, 0, front);
    expect(isSilenced(s, front)).toBe(true);
    expect(isSilenced(s, partner)).toBe(false);
    untilFree(w, front);
    expect(isSilenced(s, front)).toBe(true);
    const evs = step(w, [0, Cmd.swap1]);
    expect(evs.some((e) => e.kind === SimEventKind.swapped)).toBe(true);
  });
});
