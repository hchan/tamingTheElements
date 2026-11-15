import { describe, expect, it } from 'vitest';
import {
  CC_DR_RESET_TICKS, CC_RIDERS, CcBucket, CcEnd, CcKind, CcResist, COMBO_STUN_CAP_TICKS, ICE_GRACE_TICKS, ICE_SHATTER_PM,
  ICED_TICKS, RECOVERY_INVULN_TICKS, Weather,
} from '../../../data/arcade';
import { ALL_ABILITIES } from '../../../data/abilities-all';
import { CHARACTERS } from '../../../data/characters';
import { characterId } from '../../../data/ids';
import { DEFAULT_SIM_FLAGS } from '../../../flags';
import { now } from '../../clock';
import { Cmd } from '../../commands';
import { EventSink, SimEventKind, type SimEvent } from '../../events';
import { createMatch, type MatchSetup } from '../../match';
import { ARCADE_E, ARCADE_WORLD_BASE, ArcadeE, ArcadeW, MAX_ENTITIES } from '../../state';
import { step } from '../../step';
import { onProjectileHit } from '../debuffs';
import { listStatuses, StatusId } from '../status';
import type { SimWorld } from '../../world';
import { applyCc } from './cc';
import { ccHeld, ccLevel } from './cc-state';
import { applyArcadeHit } from './hit';
import { skipIntro } from './round-testkit';

const DEFS = ALL_ABILITIES;
const def = (slug: string): number => DEFS.findIndex((d) => d.id === slug);
const ICE_BLAST = def('ice-blast');
const ICICLES = def('icicles');
const ICE_SHOCK = def('ice-shock');
const PLAIN = def('fireball');
const E = (id: number, f: number): number => id * ARCADE_E + f;
const VICTIM = 1;
const ATT = 0;

/** Morblass (id 0, water) against Pax (id 1, the victim), flag on or off. */
function duel(on: boolean, seed = 9): SimWorld {
  const setup: MatchSetup = {
    simVersion: 70, seed, flags: { ...DEFAULT_SIM_FLAGS, rulesetArcade: true, withCrowdControl: on }, chapter: 1, difficulty: 1,
    p1: [{ character: characterId('morblass'), xp: 1 }],
    p2: [{ character: characterId('pax'), xp: 1 }],
  };
  const w = skipIntro(createMatch(setup));
  const s = w.state;
  s.x[0] = 300; s.y[0] = 300; s.dir[0] = 0;
  s.x[1] = 450; s.y[1] = 300; s.dir[1] = 4;
  return w;
}

const hit = (w: SimWorld, d: number, att = ATT, victim = VICTIM, base = 10): SimEvent[] => {
  const sk = new EventSink(now(w.state));
  applyArcadeHit(w, sk, att, att, victim, base, d, 0);
  return [...sk.events];
};
const chill = (w: SimWorld, victim = VICTIM): void => { onProjectileHit(w, 'ice-blast', victim, ATT); };
const ids = (w: SimWorld, id = VICTIM): number[] => listStatuses(w.state, id).map((x) => x.id);
const run = (w: SimWorld, n: number): void => { const end = now(w.state) + n; for (let i = 0; i < n + 200 && now(w.state) < end; i++) step(w, [0, 0]); };
const stun = (w: SimWorld, id = VICTIM): number => w.state.arcade[E(id, ArcadeE.stunUntil)] ?? 0;
const ice = (w: SimWorld): boolean => applyCc(w, new EventSink(now(w.state)), ATT, ATT, VICTIM, CcKind.iced, ICED_TICKS);

describe('CB2 iced: the water rider', () => {
  it('the table has three ice rows, all chilled-only', () => {
    expect(ICE_BLAST).toBeGreaterThanOrEqual(0);
    expect(ICICLES).toBeGreaterThanOrEqual(0);
    expect(ICE_SHOCK).toBeGreaterThanOrEqual(0);
    expect(CC_RIDERS.filter((r) => r.kind === CcKind.iced).map((r) => [r.slug, r.ticks, r.chilled])).toEqual([
      ['ice-blast', ICED_TICKS, true], ['icicles', ICED_TICKS, true], ['ice-shock', ICED_TICKS, true],
    ]);
  });

  it('flag off: an ice hit on a chilled foe stuns as usual, with no CC status or event', () => {
    const w = duel(false);
    chill(w);
    const g = now(w.state);
    const evs = hit(w, ICICLES);
    expect(ids(w)).toEqual([StatusId.iceBlast]);
    expect(stun(w)).toBeGreaterThan(g);
    for (const e of evs) expect(e.kind).toBeLessThan(79);
  });

  it('flag on: the first ice hit on an unchilled foe only slows (no ice)', () => {
    const w = duel(true);
    const evs = hit(w, ICE_BLAST);
    expect(ids(w)).toEqual([]);
    expect(evs.some((e) => e.kind === SimEventKind.ccStarted)).toBe(false);
    expect(onProjectileHit(w, 'ice-blast', VICTIM, ATT)).toBe(true); // the projectile system adds the slow after the hit
    expect(ids(w)).toEqual([StatusId.iceBlast]);
  });

  it('flag on: an ice hit on a chilled foe ices it, uses up the chill, restores speed, skips stun and knockback', () => {
    const w = duel(true);
    const s = w.state;
    const base = s.speed[VICTIM] ?? 0;
    chill(w);
    expect(s.speed[VICTIM]).toBeLessThan(base);
    const g = now(s);
    const evs = hit(w, ICE_SHOCK);
    expect(ids(w)).toContain(StatusId.iced);
    expect(ids(w)).not.toContain(StatusId.iceBlast);
    expect(s.speed[VICTIM]).toBe(base);
    expect(ccHeld(s, VICTIM)).toBe(true);
    expect(stun(w)).toBeLessThanOrEqual(g);
    expect(s.arcade[E(VICTIM, ArcadeE.kbVx)]).toBe(0);
    expect(s.arcade[E(VICTIM, ArcadeE.kbVy)]).toBe(0);
    expect(listStatuses(s, VICTIM).find((x) => x.id === StatusId.iced)?.expireTick).toBe(g + ICED_TICKS);
    expect(evs.find((e) => e.kind === SimEventKind.ccStarted)).toMatchObject({ id: VICTIM, cc: CcKind.iced, ticks: ICED_TICKS, source: ATT, level: 0 });
  });

  it('an Ice Blast that freezes does not re-chill its own victim; a puddle slow counts as chilled', () => {
    const w = duel(true);
    chill(w);
    hit(w, ICE_BLAST);
    expect(ids(w)).toContain(StatusId.iced);
    expect(onProjectileHit(w, 'ice-blast', VICTIM, ATT)).toBe(false);
    expect(ids(w)).not.toContain(StatusId.iceBlast);
    const p = duel(true);
    p.state.arcade[E(VICTIM, ArcadeE.trapSlowUntil)] = now(p.state) + 30;
    hit(p, ICICLES);
    expect(ids(p)).toContain(StatusId.iced);
    expect(p.state.arcade[E(VICTIM, ArcadeE.trapSlowUntil)]).toBe(0);
  });

  it('non-ice hits never ice a chilled foe', () => {
    const w = duel(true);
    chill(w);
    hit(w, PLAIN);
    expect(ids(w)).not.toContain(StatusId.iced);
    expect(ids(w)).toContain(StatusId.iceBlast);
  });

  it('re-hit: an ice hit on an iced foe is resisted busy and the ice stays single', () => {
    const w = duel(true);
    chill(w);
    hit(w, ICICLES);
    run(w, 2);
    w.state.arcade[E(VICTIM, ArcadeE.trapSlowUntil)] = now(w.state) + 30; // chilled again (a puddle)
    const evs = hit(w, ICICLES);
    expect(evs.find((e) => e.kind === SimEventKind.ccResisted)).toMatchObject({ reason: CcResist.busy });
    expect(ids(w).filter((i) => i === StatusId.iced)).toHaveLength(1);
  });

  it('shatter: the first hit past the grace deals ICE_SHATTER_PM / 1000 of a plain hit, then stuns normally', () => {
    const dmg = (iced: boolean): { amount: number; w: SimWorld; evs: SimEvent[] } => {
      const w = duel(true);
      if (iced) ice(w);
      run(w, ICE_GRACE_TICKS);
      w.state.arcade[E(VICTIM, ArcadeE.invulnUntil)] = 0;
      const evs = hit(w, PLAIN, ATT, VICTIM, 20);
      return { amount: evs.find((e) => e.kind === SimEventKind.damage)?.amount as number, w, evs };
    };
    const a = dmg(true);
    const b = dmg(false);
    expect(a.amount / b.amount).toBeCloseTo(ICE_SHATTER_PM / 1000, 5);
    expect(a.evs.find((e) => e.kind === SimEventKind.ccEnded)).toMatchObject({ cc: CcKind.iced, reason: CcEnd.shattered });
    expect(ids(a.w)).not.toContain(StatusId.iced);
    expect(stun(a.w)).toBeGreaterThan(now(a.w.state));
  });

  it('a hit inside the grace leaves the ice on', () => {
    const w = duel(true);
    ice(w);
    run(w, 2);
    hit(w, PLAIN);
    expect(ids(w)).toContain(StatusId.iced);
  });

  it('a fire hit thaws the ice at once; Sunshine thaws it and blocks a new one', () => {
    const w = duel(true);
    ice(w);
    w.state.defId[ATT] = CHARACTERS.findIndex((c) => c.element === 'fire');
    const evs = hit(w, PLAIN);
    expect(evs.find((e) => e.kind === SimEventKind.ccEnded)).toMatchObject({ reason: CcEnd.thawed });
    expect(ids(w)).not.toContain(StatusId.iced);
    const sun = duel(true);
    ice(sun);
    sun.state.arcade[ARCADE_WORLD_BASE + ArcadeW.weather] = Weather.sun;
    sun.state.arcade[ARCADE_WORLD_BASE + ArcadeW.weatherUntil] = now(sun.state) + 500;
    const ev2: readonly SimEvent[] = step(sun, [0, 0]);
    expect(ev2.find((e) => e.kind === SimEventKind.ccEnded)).toMatchObject({ reason: CcEnd.thawed });
    expect(ice(sun)).toBe(false);
  });

  it('the ice expires on its own', () => {
    const w = duel(true);
    ice(w);
    const evs: SimEvent[] = [];
    for (let i = 0; i < ICED_TICKS + 2; i++) evs.push(...step(w, [0, 0]));
    expect(evs.find((e) => e.kind === SimEventKind.ccEnded)).toMatchObject({ cc: CcKind.iced, reason: CcEnd.expired });
  });

  it('a guarding victim is chipped, not iced, and keeps its chill', () => {
    const w = duel(true);
    for (let i = 0; i < 14; i++) step(w, [0, Cmd.guard]);
    chill(w);
    hit(w, ICICLES);
    expect(ids(w)).not.toContain(StatusId.iced);
    expect(ids(w)).toContain(StatusId.iceBlast);
  });

  it('a parried ice hit does not ice the parrier', () => {
    const w = duel(true);
    chill(w);
    w.state.arcade[E(VICTIM, ArcadeE.parryUntil)] = now(w.state) + 6;
    hit(w, ICE_SHOCK);
    expect(ids(w)).not.toContain(StatusId.iced);
  });

  it('DR: back-to-back ice is 45, 22, immune, then resets', () => {
    const w = duel(true);
    const lens: number[] = [];
    let immune = false;
    for (let k = 0; k < 3; k++) {
      const sk = new EventSink(now(w.state));
      applyCc(w, sk, ATT, ATT, VICTIM, CcKind.iced, ICED_TICKS);
      const st = sk.events.find((e) => e.kind === SimEventKind.ccStarted);
      if (st !== undefined) lens.push(st.ticks as number);
      if (sk.events.some((e) => e.kind === SimEventKind.ccResisted && e.reason === CcResist.immune)) immune = true;
      run(w, ICED_TICKS + 1);
    }
    expect(lens).toEqual([ICED_TICKS, ICED_TICKS >> 1]);
    expect(immune).toBe(true);
    expect(ccLevel(w.state, VICTIM, CcBucket.incapacitate)).toBe(2);
    run(w, CC_DR_RESET_TICKS + 2);
    expect(ccLevel(w.state, VICTIM, CcBucket.incapacitate)).toBe(0);
  });

  it('chain-lock bound (2v2): two water attackers re-chilling and hitting never lock a victim past the window', () => {
    const setup: MatchSetup = {
      simVersion: 70, seed: 5, flags: { ...DEFAULT_SIM_FLAGS, rulesetArcade: true, withCrowdControl: true }, chapter: 1, difficulty: 1,
      p1: [{ character: characterId('morblass'), xp: 1 }, { character: characterId('curomo'), xp: 1 }],
      p2: [{ character: characterId('pax'), xp: 1 }, { character: characterId('treenoc'), xp: 1 }],
    };
    const w = skipIntro(createMatch(setup));
    const s = w.state;
    const waters: number[] = [];
    let victim = -1;
    for (let id = 0; id < MAX_ENTITIES; id++) {
      if (((s.flags[id] ?? 0) & 1) === 0 && s.hp[id] === 0) continue;
      if (s.team[id] === 0 && CHARACTERS[s.defId[id] ?? 0]?.element === 'water' && s.maxHp[id] !== 0) waters.push(id);
      if (s.team[id] === 1 && victim < 0 && s.maxHp[id] !== 0) victim = id;
    }
    expect(waters.length).toBe(2);
    expect(victim).toBeGreaterThanOrEqual(0);
    s.x[victim] = 450; s.y[victim] = 300;
    const window = ICED_TICKS + COMBO_STUN_CAP_TICKS + RECOVERY_INVULN_TICKS;
    const slugs = [ICE_BLAST, ICICLES, ICE_SHOCK];
    let lastFree = now(s);
    for (let t = 0; t < window * 4; t++) {
      const att = waters[t % 2] ?? 0;
      chill(w, victim);
      const sk = new EventSink(now(s));
      applyArcadeHit(w, sk, att, att, victim, 5, slugs[t % 3] ?? ICE_BLAST, 0);
      step(w, [0, 0]);
      const free = !ccHeld(s, victim) && (s.arcade[E(victim, ArcadeE.stunUntil)] ?? 0) <= now(s);
      if (free) lastFree = now(s);
      expect(now(s) - lastFree).toBeLessThanOrEqual(window);
    }
  });
});

describe('flag-off property: no CC state leaks into a match', () => {
  const NAMES = ['morblass', 'curomo', 'pax', 'cyclonius', 'fiara', 'treenoc'];
  it('seeded Arcade matches (1v1 and 2v2, random input) write no status >= 10 and emit no event kind >= 79', () => {
    for (let seed = 1; seed <= 8; seed++) {
      const two = seed % 2 === 0;
      const pick = (i: number): { character: ReturnType<typeof characterId>; xp: number }[] =>
        (two ? [i, i + 1] : [i]).map((k) => ({ character: characterId(NAMES[(k + seed) % NAMES.length] ?? 'pax'), xp: 1 }));
      const setup: MatchSetup = {
        simVersion: 70, seed, flags: { ...DEFAULT_SIM_FLAGS, rulesetArcade: true, withCrowdControl: false }, chapter: 1, difficulty: 1,
        p1: pick(0), p2: pick(2),
      };
      const w = skipIntro(createMatch(setup));
      let r = (seed * 2654435761) >>> 0;
      const rnd = (): number => { r = (Math.imul(r, 1664525) + 1013904223) >>> 0; return r >>> 8; };
      const keys = [Cmd.primary, Cmd.secondary, Cmd.dash, Cmd.guard, Cmd.cleanse, Cmd.super, Cmd.weather, Cmd.left, Cmd.right, Cmd.up, Cmd.down];
      let c0 = 0;
      let c1 = 0;
      for (let t = 0; t < 3000; t++) {
        if (t % 6 === 0) {
          c0 = (keys[rnd() % keys.length] ?? 0) | (keys[rnd() % keys.length] ?? 0);
          c1 = (keys[rnd() % keys.length] ?? 0) | (keys[rnd() % keys.length] ?? 0);
        }
        for (const e of step(w, [c0, c1])) if (e.kind >= 79) throw new Error(`seed ${String(seed)} tick ${String(t)}: event kind ${String(e.kind)}`);
        for (let id = 0; id < MAX_ENTITIES; id++) {
          for (const x of listStatuses(w.state, id)) if (x.id >= 10) throw new Error(`seed ${String(seed)} tick ${String(t)}: status ${String(x.id)}`);
        }
      }
    }
  });
});
