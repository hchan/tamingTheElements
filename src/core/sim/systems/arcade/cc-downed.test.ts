import { describe, expect, it } from 'vitest';
import {
  CC_DR_RESET_TICKS, CC_RIDERS, COMBO_STUN_CAP_TICKS, CcBucket, CcEnd, CcKind, CcResist, DOWN_TICKS, QUICK_RISE_TICKS,
  QUICK_RISE_WINDOW_TICKS, RECOVERY_INVULN_TICKS, WAKE_INVULN_TICKS,
} from '../../../data/arcade';
import { ABILITIES_A } from '../../../data/abilities-a';
import { ABILITIES_B } from '../../../data/abilities-b';
import { characterId } from '../../../data/ids';
import { DEFAULT_SIM_FLAGS } from '../../../flags';
import { now } from '../../clock';
import { Cmd } from '../../commands';
import { EventSink, SimEventKind, type SimEvent } from '../../events';
import { createMatch, type MatchSetup } from '../../match';
import { ARCADE_E, ArcadeE, MAX_ENTITIES } from '../../state';
import { step } from '../../step';
import { listStatuses, StatusId } from '../status';
import type { SimWorld } from '../../world';
import { applyCc } from './cc';
import { ccHeld, ccLevel } from './cc-state';
import { applyArcadeHit } from './hit';
import { skipIntro } from './round-testkit';
import { isInvulnerable } from './stun';

const DEFS = [...ABILITIES_A, ...ABILITIES_B];
const def = (slug: string): number => DEFS.findIndex((d) => d.id === slug);
const SHOCK = def('ground-shock');
const PLAIN = def('fireball');
const E = (id: number, f: number): number => id * ARCADE_E + f;
const ATT = 0;
const VICTIM = 1;

/** Pax (id 0, Ground Shock) against Morblass (id 1, the victim), flag on or off. */
function duel(on: boolean, seed = 9): SimWorld {
  const setup: MatchSetup = {
    simVersion: 70, seed, flags: { ...DEFAULT_SIM_FLAGS, rulesetArcade: true, withCrowdControl: on }, chapter: 1, difficulty: 1,
    p1: [{ character: characterId('pax'), xp: 1 }],
    p2: [{ character: characterId('morblass'), xp: 1 }],
  };
  const w = skipIntro(createMatch(setup));
  const s = w.state;
  s.x[0] = 300; s.y[0] = 300; s.dir[0] = 0;
  s.x[1] = 400; s.y[1] = 300; s.dir[1] = 4;
  return w;
}

const hit = (w: SimWorld, d: number, att = ATT, victim = VICTIM, base = 25): SimEvent[] => {
  const sk = new EventSink(now(w.state));
  applyArcadeHit(w, sk, att, att, victim, base, d, 0);
  return [...sk.events];
};
const ids = (w: SimWorld, id = VICTIM): number[] => listStatuses(w.state, id).map((x) => x.id);
/** Steps n GAME ticks (hit-stop freezes the game clock, so wall steps are not enough). */
const run = (w: SimWorld, n: number): void => { const end = now(w.state) + n; for (let i = 0; i < n + 200 && now(w.state) < end; i++) step(w, [0, 0]); };
/** Steps until `n` game ticks passed, collecting every event. */
const runEv = (w: SimWorld, n: number): SimEvent[] => {
  const out: SimEvent[] = [];
  const end = now(w.state) + n;
  for (let i = 0; i < n + 200 && now(w.state) < end; i++) out.push(...step(w, [0, 0]));
  return out;
};
const stun = (w: SimWorld, id = VICTIM): number => w.state.arcade[E(id, ArcadeE.stunUntil)] ?? 0;
const status = (w: SimWorld, sid: number): { startTick: number; expireTick: number } | undefined =>
  listStatuses(w.state, VICTIM).find((x) => x.id === sid);

describe('CB3 downed: the Ground Shock rider', () => {
  it('the table has one downed row: ground-shock for DOWN_TICKS (Pax is the only host)', () => {
    expect(SHOCK).toBeGreaterThanOrEqual(0);
    expect(CC_RIDERS.filter((r) => r.kind === CcKind.downed)).toEqual([{ slug: 'ground-shock', kind: CcKind.downed, ticks: DOWN_TICKS }]);
  });

  it('flag off: a Ground Shock hit stuns as usual, with no CC status, no knockdown invulnerability and no event', () => {
    const w = duel(false);
    const g = now(w.state);
    const evs = hit(w, SHOCK);
    expect(ids(w)).toEqual([]);
    expect(stun(w)).toBeGreaterThan(g);
    expect(w.state.arcade[E(VICTIM, ArcadeE.invulnUntil)] ?? 0).toBeLessThanOrEqual(g);
    for (const e of evs) expect(e.kind).toBeLessThan(79);
  });

  it('flag on: the hit knocks down (no hit-stun), grants invulnerability to the wake, emits ccStarted', () => {
    const w = duel(true);
    const s = w.state;
    const g = now(s);
    const evs = hit(w, SHOCK);
    expect(ids(w)).toContain(StatusId.downed);
    expect(ccHeld(s, VICTIM)).toBe(true);
    expect(stun(w)).toBeLessThanOrEqual(g);
    expect(status(w, StatusId.downed)?.expireTick).toBe(g + DOWN_TICKS);
    expect(s.arcade[E(VICTIM, ArcadeE.invulnUntil)]).toBe(g + DOWN_TICKS + WAKE_INVULN_TICKS);
    expect(evs.find((e) => e.kind === SimEventKind.ccStarted)).toMatchObject({ id: VICTIM, cc: CcKind.downed, ticks: DOWN_TICKS, source: ATT, level: 0 });
  });

  it('the knockdown keeps the hit knockback (the slide)', () => {
    const on = duel(true);
    const off = duel(false);
    hit(on, SHOCK);
    hit(off, SHOCK);
    expect(on.state.arcade[E(VICTIM, ArcadeE.kbVx)]).toBe(off.state.arcade[E(VICTIM, ArcadeE.kbVx)]);
    expect(on.state.arcade[E(VICTIM, ArcadeE.kbVy)]).toBe(off.state.arcade[E(VICTIM, ArcadeE.kbVy)]);
  });

  it('other abilities never knock down', () => {
    const w = duel(true);
    hit(w, PLAIN);
    expect(ids(w)).not.toContain(StatusId.downed);
  });

  it('a downed foe is invulnerable through the down and the wake ticks, then hittable', () => {
    const w = duel(true);
    const s = w.state;
    hit(w, SHOCK);
    run(w, 5);
    expect(isInvulnerable(s, VICTIM)).toBe(true);
    run(w, DOWN_TICKS - 5 + 1);
    expect(ids(w)).not.toContain(StatusId.downed);
    expect(isInvulnerable(s, VICTIM)).toBe(true); // the wake invulnerability
    run(w, WAKE_INVULN_TICKS + 1);
    expect(isInvulnerable(s, VICTIM)).toBe(false);
  });

  it('re-hit: a second Ground Shock on a downed foe is resisted busy and the knockdown stays single', () => {
    const w = duel(true);
    hit(w, SHOCK);
    run(w, 2);
    const evs = hit(w, SHOCK);
    expect(evs.find((e) => e.kind === SimEventKind.ccResisted)).toMatchObject({ reason: CcResist.busy });
    expect(ids(w).filter((i) => i === StatusId.downed)).toHaveLength(1);
  });

  it('a downed hero cannot act: a cast or dash press does nothing until it rises', () => {
    const w = duel(true);
    const s = w.state;
    hit(w, SHOCK);
    step(w, [0, Cmd.primary | Cmd.secondary | Cmd.guard]);
    expect(ids(w)).toContain(StatusId.downed);
    expect(s.arcade[E(VICTIM, ArcadeE.blockUntil)] ?? 0).toBeLessThanOrEqual(now(s));
  });

  it('expiry ends it as expired', () => {
    const w = duel(true);
    hit(w, SHOCK);
    const evs = runEv(w, DOWN_TICKS + 2);
    expect(evs.find((e) => e.kind === SimEventKind.ccEnded)).toMatchObject({ cc: CcKind.downed, reason: CcEnd.expired });
  });

  it('quick-rise: a Dash press inside the window rises at QUICK_RISE_TICKS, is consumed (no dash), the wake follows', () => {
    const w = duel(true);
    const s = w.state;
    const g = now(s);
    hit(w, SHOCK);
    run(w, 1); // out of the hit-stop
    const evs: SimEvent[] = [];
    evs.push(...step(w, [0, Cmd.dash]));
    expect(s.arcade[E(VICTIM, ArcadeE.dashUntil)] ?? 0).toBeLessThanOrEqual(now(s));
    expect(status(w, StatusId.downed)?.expireTick).toBe(g + QUICK_RISE_TICKS);
    expect(s.arcade[E(VICTIM, ArcadeE.invulnUntil)]).toBe(g + QUICK_RISE_TICKS + WAKE_INVULN_TICKS);
    for (let i = 0; i < QUICK_RISE_TICKS + 4; i++) evs.push(...step(w, [0, 0]));
    expect(evs.find((e) => e.kind === SimEventKind.ccEnded)).toMatchObject({ cc: CcKind.downed, reason: CcEnd.quickRise });
    expect(ids(w)).not.toContain(StatusId.downed);
    // no dash fired when it rose either (the press was consumed)
    expect(s.arcade[E(VICTIM, ArcadeE.dashUntil)] ?? 0).toBeLessThanOrEqual(g + 2);
  });

  it('quick-rise: a Dash press after the window does not count', () => {
    const w = duel(true);
    hit(w, SHOCK);
    run(w, QUICK_RISE_WINDOW_TICKS + 3);
    step(w, [0, Cmd.dash]);
    run(w, 5);
    expect(ids(w)).toContain(StatusId.downed);
  });

  it('quick-rise: a Dash press buffered before the knockdown does not count', () => {
    const w = duel(true);
    step(w, [0, Cmd.dash]);
    hit(w, SHOCK);
    const evs = runEv(w, DOWN_TICKS + 2);
    expect(evs.find((e) => e.kind === SimEventKind.ccEnded)).toMatchObject({ reason: CcEnd.expired });
  });

  it('a guarding victim is chipped, not downed', () => {
    const w = duel(true);
    for (let i = 0; i < 14; i++) step(w, [0, Cmd.guard]);
    hit(w, SHOCK);
    expect(ids(w)).not.toContain(StatusId.downed);
  });

  it('a parried Ground Shock does not knock down the parrier', () => {
    const w = duel(true);
    w.state.arcade[E(VICTIM, ArcadeE.parryUntil)] = now(w.state) + 6;
    hit(w, SHOCK);
    expect(ids(w)).not.toContain(StatusId.downed);
  });

  it('DR: back-to-back knockdowns are 40, 20, immune, then reset', () => {
    const w = duel(true);
    const lens: number[] = [];
    let immune = false;
    for (let k = 0; k < 3; k++) {
      const sk = new EventSink(now(w.state));
      applyCc(w, sk, ATT, ATT, VICTIM, CcKind.downed, DOWN_TICKS);
      const st = sk.events.find((e) => e.kind === SimEventKind.ccStarted);
      if (st !== undefined) lens.push(st.ticks as number);
      if (sk.events.some((e) => e.kind === SimEventKind.ccResisted && e.reason === CcResist.immune)) immune = true;
      run(w, DOWN_TICKS + WAKE_INVULN_TICKS + 1);
    }
    expect(lens).toEqual([DOWN_TICKS, DOWN_TICKS >> 1]);
    expect(immune).toBe(true);
    expect(ccLevel(w.state, VICTIM, CcBucket.stun)).toBe(2);
    run(w, CC_DR_RESET_TICKS + 2);
    expect(ccLevel(w.state, VICTIM, CcBucket.stun)).toBe(0);
  });

  it('chain-lock bound (1v1): hitting every tick never locks the victim past the window', () => {
    const w = duel(true);
    const s = w.state;
    const window = DOWN_TICKS + COMBO_STUN_CAP_TICKS + RECOVERY_INVULN_TICKS + WAKE_INVULN_TICKS;
    let lastFree = now(s);
    for (let t = 0; t < window * 5; t++) {
      hit(w, SHOCK);
      hit(w, PLAIN, ATT, VICTIM, 5);
      step(w, [0, 0]);
      const free = !ccHeld(s, VICTIM) && (s.arcade[E(VICTIM, ArcadeE.stunUntil)] ?? 0) <= now(s) && !isInvulnerable(s, VICTIM);
      if (free) lastFree = now(s);
      expect(now(s) - lastFree).toBeLessThanOrEqual(window);
    }
  });

  it('chain-lock bound (2v2): two attackers alternating Ground Shock and a plain hit never lock a victim past the window', () => {
    const setup: MatchSetup = {
      simVersion: 70, seed: 5, flags: { ...DEFAULT_SIM_FLAGS, rulesetArcade: true, withCrowdControl: true }, chapter: 1, difficulty: 1,
      p1: [{ character: characterId('pax'), xp: 1 }, { character: characterId('curomo'), xp: 1 }],
      p2: [{ character: characterId('morblass'), xp: 1 }, { character: characterId('treenoc'), xp: 1 }],
    };
    const w = skipIntro(createMatch(setup));
    const s = w.state;
    const atts: number[] = [];
    let victim = -1;
    for (let id = 0; id < MAX_ENTITIES; id++) {
      if (s.maxHp[id] === 0) continue;
      if (s.team[id] === 0) atts.push(id);
      else if (victim < 0) victim = id;
    }
    expect(atts.length).toBe(2);
    s.x[victim] = 450; s.y[victim] = 300;
    const window = DOWN_TICKS + COMBO_STUN_CAP_TICKS + RECOVERY_INVULN_TICKS + WAKE_INVULN_TICKS;
    let lastFree = now(s);
    for (let t = 0; t < window * 5; t++) {
      const att = atts[t % 2] ?? 0;
      const sk = new EventSink(now(s));
      applyArcadeHit(w, sk, att, att, victim, 25, t % 3 === 0 ? PLAIN : SHOCK, 0);
      step(w, [0, 0]);
      const free = !ccHeld(s, victim) && (s.arcade[E(victim, ArcadeE.stunUntil)] ?? 0) <= now(s) && !isInvulnerable(s, victim);
      if (free) lastFree = now(s);
      expect(now(s) - lastFree).toBeLessThanOrEqual(window);
    }
  });
});
