import { describe, expect, it } from 'vitest';
import {
  CC_DR_RESET_TICKS, CC_RIDERS, COMBO_STUN_CAP_TICKS, CcBucket, CcEnd, CcKind, CcResist, DAZE_GRACE_TICKS, DAZE_TICKS,
  FREEZE_STUN_TICKS, RECOVERY_INVULN_TICKS,
} from '../../../data/arcade';
import { ABILITIES_A } from '../../../data/abilities-a';
import { ABILITIES_B } from '../../../data/abilities-b';
import { characterId } from '../../../data/ids';
import { DEFAULT_SIM_FLAGS } from '../../../flags';
import { now } from '../../clock';
import { Cmd } from '../../commands';
import { EventSink, SimEventKind, type SimEvent } from '../../events';
import { createMatch, type MatchSetup } from '../../match';
import { ARCADE_E, ArcadeE, EntityFlag, EntityKind, MAX_ENTITIES, cooldownIdx } from '../../state';
import { step } from '../../step';
import { listStatuses, StatusId } from '../status';
import type { SimWorld } from '../../world';
import { ccHeld, ccLevel } from './cc-state';
import { applyArcadeHit } from './hit';
import { skipIntro } from './round-testkit';

const TORNADO = [...ABILITIES_A, ...ABILITIES_B].findIndex((d) => d.id === 'tornado');
const PLAIN = TORNADO === 0 ? 1 : 0;
const E = (id: number, f: number): number => id * ARCADE_E + f;

/** Pax (id 0) against Cyclonius (id 1, the Tornado's owner), flag on or off. */
function duel(on: boolean, seed = 9): SimWorld {
  const setup: MatchSetup = {
    simVersion: 70, seed, flags: { ...DEFAULT_SIM_FLAGS, rulesetArcade: true, withCrowdControl: on }, chapter: 1, difficulty: 1,
    p1: [{ character: characterId('pax'), xp: 1 }],
    p2: [{ character: characterId('cyclonius'), xp: 1 }],
  };
  const w = skipIntro(createMatch(setup));
  const s = w.state;
  s.x[0] = 300; s.y[0] = 300; s.dir[0] = 0;
  s.x[1] = 600; s.y[1] = 300; s.dir[1] = 4;
  return w;
}

const hit = (w: SimWorld, victim = 0, base = 5, att = 1): SimEvent[] => {
  const sk = new EventSink(now(w.state));
  applyArcadeHit(w, sk, att, att, victim, base, TORNADO, 0);
  return [...sk.events];
};
const ids = (w: SimWorld, id = 0): number[] => listStatuses(w.state, id).map((x) => x.id);
/** Steps n GAME ticks (hit-stop freezes the game clock, so wall steps are not enough). */
const run = (w: SimWorld, n: number): void => { const end = now(w.state) + n; for (let i = 0; i < n + 200 && now(w.state) < end; i++) step(w, [0, 0]); };

describe('CB1 daze: the Tornado rider', () => {
  it('the table has one row: tornado dazes for DAZE_TICKS', () => {
    expect(TORNADO).toBeGreaterThanOrEqual(0);
    expect(CC_RIDERS).toEqual([{ slug: 'tornado', kind: CcKind.daze, ticks: DAZE_TICKS }]);
  });

  it('flag off: a Tornado hit stuns FREEZE_STUN_TICKS and writes no CC status or event', () => {
    const w = duel(false);
    const g = now(w.state);
    const evs = hit(w);
    expect(w.state.arcade[E(0, ArcadeE.stunUntil)]).toBe(g + FREEZE_STUN_TICKS);
    expect(ids(w)).toEqual([]);
    for (const e of evs) expect(e.kind).toBeLessThan(79);
  });

  it('flag on: a Tornado hit dazes (no 60-tick hit-stun), keeps the knockback, emits ccStarted', () => {
    const w = duel(true);
    const g = now(w.state);
    const evs = hit(w);
    expect(ids(w)).toContain(StatusId.dazed);
    expect(ccHeld(w.state, 0)).toBe(true);
    expect(w.state.arcade[E(0, ArcadeE.stunUntil)]).toBeLessThanOrEqual(g);
    expect(listStatuses(w.state, 0).find((x) => x.id === StatusId.dazed)?.expireTick).toBe(g + DAZE_TICKS);
    expect(evs.find((e) => e.kind === SimEventKind.ccStarted)).toMatchObject({ id: 0, cc: CcKind.daze, ticks: DAZE_TICKS, source: 1, level: 0 });
    expect((w.state.arcade[E(0, ArcadeE.kbVx)] ?? 0) !== 0 || (w.state.arcade[E(0, ArcadeE.kbVy)] ?? 0) !== 0).toBe(true);
  });

  it('a second Tornado hit during the daze is resisted busy and gets the normal stun', () => {
    const w = duel(true);
    hit(w);
    run(w, 2);
    const evs = hit(w);
    expect(evs.find((e) => e.kind === SimEventKind.ccResisted)).toMatchObject({ reason: CcResist.busy });
    expect(ids(w).filter((i) => i === StatusId.dazed)).toHaveLength(1);
  });

  it('other abilities never daze', () => {
    const w = duel(true);
    const sk = new EventSink(now(w.state));
    applyArcadeHit(w, sk, 1, 1, 0, 5, PLAIN, 0);
    expect(ids(w)).not.toContain(StatusId.dazed);
  });

  it('a hit after the grace breaks the daze and stuns as a fresh combo; a hit inside the grace does not', () => {
    const w = duel(true);
    hit(w);
    run(w, 2);
    hit(w, 0, 5); // not the tornado def? it is: busy, still inside the grace
    expect(ids(w)).toContain(StatusId.dazed);
    run(w, DAZE_GRACE_TICKS);
    const sk = new EventSink(now(w.state));
    applyArcadeHit(w, sk, 1, 1, 0, 5, PLAIN, 0); // a plain hit past the grace
    expect(ids(w)).not.toContain(StatusId.dazed);
    expect(sk.events.find((e) => e.kind === SimEventKind.ccEnded)).toMatchObject({ reason: CcEnd.broken });
    expect(w.state.arcade[E(0, ArcadeE.stunUntil)] ?? 0).toBeGreaterThan(now(w.state));
  });

  it('a zero-damage hit never breaks the daze', () => {
    const w = duel(true);
    hit(w);
    run(w, DAZE_GRACE_TICKS + 2);
    hit(w, 0, 0);
    expect(ids(w)).toContain(StatusId.dazed);
  });

  it('mashing shortens the daze: ends as mashed', () => {
    const w = duel(true);
    hit(w);
    const evs: SimEvent[] = [];
    for (let i = 0; i < DAZE_TICKS; i++) evs.push(...step(w, [i % 2 === 0 ? Cmd.primary : 0, 0]));
    const end = evs.find((e) => e.kind === SimEventKind.ccEnded);
    expect(end).toMatchObject({ cc: CcKind.daze, reason: CcEnd.mashed });
    expect((end?.tick ?? 999) - 0).toBeLessThan(DAZE_TICKS + 100);
  });

  it('a guarding victim is chipped, not dazed', () => {
    const w = duel(true);
    w.state.arcade[E(0, ArcadeE.guardDrain)] = 0;
    // hold guard long enough to be past the parry window
    for (let i = 0; i < 14; i++) step(w, [Cmd.guard, 0]);
    hit(w);
    expect(ids(w)).not.toContain(StatusId.dazed);
  });

  it('a dash (invulnerable) victim is not hit, so not dazed', () => {
    const w = duel(true);
    w.state.arcade[E(0, ArcadeE.invulnUntil)] = now(w.state) + 20;
    // The projectile path skips invulnerable targets before applyArcadeHit; the hit path is never reached.
    run(w, 1);
    expect(ids(w)).not.toContain(StatusId.dazed);
  });

  it('a parried (reflected) Tornado dazes its caster', () => {
    const w = duel(true);
    const s = w.state;
    s.abil[cooldownIdx(1, 0)] = 0;
    const g = now(s);
    step(w, [0, Cmd.primary]);
    let proj = -1;
    for (let id = 0; id < MAX_ENTITIES; id++) {
      if (s.kind[id] === EntityKind.projectile && ((s.flags[id] ?? 0) & EntityFlag.alive) !== 0 && s.team[id] === 1 && s.spawnTick[id] === g) proj = id;
    }
    expect(proj).toBeGreaterThan(-1);
    s.x[proj] = (s.x[0] ?? 0) + 40 - (s.vx[proj] ?? 0);
    s.y[proj] = (s.y[0] ?? 0) + 30;
    s.arcade[E(0, ArcadeE.parryUntil)] = now(s) + 6;
    step(w, [0, 0]);
    expect(s.team[proj]).toBe(0);
    expect(ids(w, 0)).not.toContain(StatusId.dazed);
    let dazed = false;
    for (let i = 0; i < 150 && !dazed; i++) { step(w, [0, 0]); dazed = ids(w, 1).includes(StatusId.dazed); }
    expect(dazed).toBe(true);
  });
});

describe('CB1 daze: diminishing returns', () => {
  it('daze on cooldown always lands in full; mashed-free back to back is 70, 35, immune, then resets', () => {
    // On the Tornado cooldown (300) the ward has expired: 300 > DAZE_TICKS + CC_DR_RESET_TICKS.
    expect(300).toBeGreaterThan(DAZE_TICKS + CC_DR_RESET_TICKS);
    const w = duel(true);
    const lens: number[] = [];
    let immune = false;
    for (let k = 0; k < 3; k++) {
      const evs = hit(w);
      const st = evs.find((e) => e.kind === SimEventKind.ccStarted);
      if (st !== undefined) lens.push(st.ticks as number);
      if (evs.some((e) => e.kind === SimEventKind.ccResisted && e.reason === CcResist.immune)) immune = true;
      run(w, DAZE_TICKS + 1);
    }
    expect(lens).toEqual([DAZE_TICKS, DAZE_TICKS >> 1]);
    expect(immune).toBe(true);
    expect(ccLevel(w.state, 0, CcBucket.disorient)).toBe(2);
    run(w, CC_DR_RESET_TICKS + 2);
    expect(ccLevel(w.state, 0, CcBucket.disorient)).toBe(0);
    const evs = hit(w);
    expect(evs.find((e) => e.kind === SimEventKind.ccStarted)).toMatchObject({ ticks: DAZE_TICKS, level: 0 });
  });

  it('chain-lock bound: the victim gets a free tick in every window, a scripted worst case', () => {
    const window = DAZE_TICKS + COMBO_STUN_CAP_TICKS + RECOVERY_INVULN_TICKS;
    const w = duel(true);
    const s = w.state;
    let lastFree = now(s);
    // The attacker hits as often as possible with every kind of hit available.
    for (let t = 0; t < window * 4; t++) {
      const sk = new EventSink(now(s));
      if (t % 3 === 0) applyArcadeHit(w, sk, 1, 1, 0, 5, t % 6 === 0 ? TORNADO : PLAIN, 0);
      step(w, [0, 0]);
      const free = !ccHeld(s, 0) && (s.arcade[E(0, ArcadeE.stunUntil)] ?? 0) <= now(s);
      if (free) lastFree = now(s);
      expect(now(s) - lastFree).toBeLessThanOrEqual(window);
    }
  });
});
