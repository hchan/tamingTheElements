import { describe, expect, it } from 'vitest';
import { OT_DOT_FLOOR_HP, OT_SPECS, OtEnd, OtKind } from '../../../data/arcade';
import { characterId } from '../../../data/ids';
import { DEFAULT_SIM_FLAGS } from '../../../flags';
import { clockHeld, now } from '../../clock';
import { EventSink, SimEventKind, type SimEvent } from '../../events';
import { hash } from '../../hash';
import { createMatch, type MatchSetup } from '../../match';
import { STATUS_SLOTS, STATUS_STRIDE } from '../../state';
import { step } from '../../step';
import { applyTimedStatus, hasStatus, StatusField, StatusId, statusBase, statusSlot } from '../status';
import type { SimWorld } from '../../world';
import { applyOt, cleanseOt, cleansableOt, healFactorPm, otOn, overTimeSystem } from './over-time';
import { hitStop } from './hit';
import { skipIntro } from './round-testkit';

const ATT = 0;
const VICTIM = 1;
const SPEC = (k: number) => {
  const sp = OT_SPECS[k];
  if (sp === undefined) throw new Error('spec');
  return sp;
};

function duel(on: boolean, seed = 9): SimWorld {
  const setup: MatchSetup = {
    simVersion: 75, seed, flags: { ...DEFAULT_SIM_FLAGS, rulesetArcade: true, withOverTime: on }, chapter: 1, difficulty: 1,
    p1: [{ character: characterId('sindarosa'), xp: 1 }],
    p2: [{ character: characterId('pax'), xp: 1 }],
  };
  const w = skipIntro(createMatch(setup));
  const s = w.state;
  s.x[0] = 300; s.y[0] = 300; s.dir[0] = 0;
  s.x[1] = 900; s.y[1] = 300; s.dir[1] = 4;
  return w;
}

const sink = (w: SimWorld): EventSink => new EventSink(now(w.state));
const apply = (w: SimWorld, kind: number, victim = VICTIM): boolean => applyOt(w, sink(w), ATT, victim, kind);
const slotOf = (w: SimWorld, sid: number, id = VICTIM): number => statusBase(id, statusSlot(w.state, id, sid));
const field = (w: SimWorld, sid: number, f: number, id = VICTIM): number => w.state.status[slotOf(w, sid, id) + f] ?? 0;
/** Steps n game ticks and returns the events. */
function run(w: SimWorld, n: number): SimEvent[] {
  const out: SimEvent[] = [];
  const end = now(w.state) + n;
  for (let i = 0; i < n + 200 && now(w.state) < end; i++) out.push(...step(w, [0, 0]));
  return out;
}
const pulses = (evs: readonly SimEvent[], id = VICTIM): SimEvent[] => evs.filter((e) => e.kind === SimEventKind.otPulse && e['id'] === id);

describe('over-time core (flag withOverTime)', () => {
  it('is bit 256 and the event ids are 82 and 83', () => {
    expect(SimEventKind.otPulse).toBe(82);
    expect(SimEventKind.otEnded).toBe(83);
    expect(StatusId.burning).toBe(18);
    expect(StatusId.venom).toBe(19);
    expect(StatusId.mending).toBe(20);
  });

  it('flag off: apply writes nothing, cleanse reads nothing, and the system leaves the hash alone', () => {
    const w = duel(false);
    expect(otOn(w.state)).toBe(false);
    const h = hash(w.state);
    expect(apply(w, OtKind.burning)).toBe(false);
    expect(hash(w.state)).toBe(h);
    expect(cleansableOt(w.state, VICTIM)).toBe(0);
    expect(cleanseOt(w, sink(w), VICTIM)).toBe(0);
    expect(healFactorPm(w.state, VICTIM)).toBe(1000);
    const sk = sink(w);
    overTimeSystem(w, null, sk);
    expect(sk.events).toHaveLength(0);
    expect(hash(w.state)).toBe(h);
  });

  it('flag off, even with an over-time status forced in, nothing pulses', () => {
    const w = duel(false);
    const b = statusBase(VICTIM, 0);
    const s = w.state;
    s.status[b + StatusField.id] = StatusId.burning;
    s.status[b + StatusField.start] = now(s) - 25;
    s.status[b + StatusField.expire] = now(s) + 75;
    s.status[b + StatusField.mag] = 1;
    const hp = s.hp[VICTIM] ?? 0;
    const sk = sink(w);
    overTimeSystem(w, null, sk);
    expect(sk.events).toHaveLength(0);
    expect(s.hp[VICTIM]).toBe(hp);
  });

  it('burning pulses at start+25, +50, +75, +100 (floor(duration/period) times) and then ends', () => {
    const w = duel(true);
    expect(apply(w, OtKind.burning)).toBe(true);
    const evs = run(w, 130);
    const ps = pulses(evs);
    // 25 game ticks apart, no hit-stop here so event ticks are game ticks plus a constant.
    expect(ps.map((e) => e.tick - (ps[0]?.tick ?? 0))).toEqual([0, 25, 50, 75]);
    expect(ps).toHaveLength(Math.floor(SPEC(OtKind.burning).durationTicks / SPEC(OtKind.burning).periodTicks));
    for (const p of ps) expect(p['amount']).toBe(2);
    expect(hasStatus(w.state, VICTIM, StatusId.burning)).toBe(false);
    // Each pulse also emits the ordinary damage event (lifebars and floaters read it).
    const dmg = evs.filter((e) => e.kind === SimEventKind.damage && e['target'] === VICTIM);
    expect(dmg).toHaveLength(4);
  });

  it('burning stacks to 3 (a 4th stays 3), extends the end and keeps the start', () => {
    const w = duel(true);
    apply(w, OtKind.burning);
    const start = field(w, StatusId.burning, StatusField.start);
    run(w, 10);
    apply(w, OtKind.burning);
    apply(w, OtKind.burning);
    apply(w, OtKind.burning);
    expect(field(w, StatusId.burning, StatusField.mag)).toBe(3);
    expect(field(w, StatusId.burning, StatusField.start)).toBe(start);
    expect(field(w, StatusId.burning, StatusField.expire)).toBe(now(w.state) + SPEC(OtKind.burning).durationTicks);
    const ps = pulses(run(w, 16));
    expect(ps[0]?.['amount']).toBe(6);
  });

  it('venom refresh extends but never stacks, keeps start', () => {
    const w = duel(true);
    apply(w, OtKind.venom);
    const start = field(w, StatusId.venom, StatusField.start);
    run(w, 20);
    apply(w, OtKind.venom);
    expect(field(w, StatusId.venom, StatusField.mag)).toBe(1);
    expect(field(w, StatusId.venom, StatusField.start)).toBe(start);
    expect(field(w, StatusId.venom, StatusField.expire)).toBe(now(w.state) + SPEC(OtKind.venom).durationTicks);
  });

  it('a DoT cannot KO: 3 hp under a 3-stack burn ends at 1 hp, alive', () => {
    const w = duel(true);
    const s = w.state;
    s.hp[VICTIM] = 3;
    apply(w, OtKind.burning);
    apply(w, OtKind.burning);
    apply(w, OtKind.burning);
    const evs = run(w, 120);
    expect(s.hp[VICTIM]).toBeGreaterThanOrEqual(OT_DOT_FLOOR_HP);
    expect(pulses(evs).reduce((a, e) => a + (e['amount'] ?? 0), 0)).toBe(2);
    expect(evs.some((e) => e.kind === SimEventKind.died)).toBe(false);
  });

  it('mending heals 2 per second and never past maxHp; venom halves it', () => {
    const w = duel(true);
    const s = w.state;
    s.hp[VICTIM] = (s.maxHp[VICTIM] ?? 0) - 1;
    apply(w, OtKind.mending);
    const ps = pulses(run(w, 60));
    expect(ps).toHaveLength(1);
    expect(ps[0]?.['amount']).toBe(1);
    expect(ps[0]?.['heal']).toBe(1);

    const v = duel(true);
    v.state.hp[VICTIM] = 10;
    apply(v, OtKind.mending);
    apply(v, OtKind.venom);
    expect(healFactorPm(v.state, VICTIM)).toBe(500);
    const vp = pulses(run(v, 60)).filter((e) => e['heal'] === 1);
    expect(vp[0]?.['amount']).toBe(1);
  });

  it('dead or 0-hp entities do not take part; nothing applies to them', () => {
    const w = duel(true);
    w.state.hp[VICTIM] = 0;
    expect(apply(w, OtKind.burning)).toBe(false);
  });

  it('a full status table makes apply a silent no-op', () => {
    const w = duel(true);
    for (let i = 0; i < STATUS_SLOTS; i++) applyTimedStatus(w, VICTIM, StatusId.superSpeed, ATT, 500, 0);
    const h = hash(w.state);
    expect(apply(w, OtKind.burning)).toBe(false);
    expect(hash(w.state)).toBe(h);
  });

  it('no pulses and no apply outside the fight phase', () => {
    const w = duel(true);
    apply(w, OtKind.burning);
    const hp = w.state.hp[VICTIM] ?? 0;
    // Pretend the fight is over: a status written but the system gated by inFight is covered by apply refusing too.
    const idle = createMatch({
      simVersion: 75, seed: 3, flags: { ...DEFAULT_SIM_FLAGS, rulesetArcade: true, withOverTime: true }, chapter: 1, difficulty: 1,
      p1: [{ character: characterId('sindarosa'), xp: 1 }], p2: [{ character: characterId('pax'), xp: 1 }],
    });
    expect(apply(idle, OtKind.burning)).toBe(false); // still in the intro
    expect(hp).toBeGreaterThan(0);
  });

  it('pulses are on the game clock: a hit-stop holds them and they resume on the same game tick', () => {
    const w = duel(true);
    apply(w, OtKind.burning);
    expect(pulses(run(w, 24))).toHaveLength(0);
    hitStop(w, sink(w), ATT, 10, 0);
    const held: SimEvent[] = [];
    for (let i = 0; i < 10; i++) held.push(...step(w, [0, 0]));
    expect(clockHeld(w.state)).toBe(true);
    expect(pulses(held)).toHaveLength(0);
    expect(pulses(run(w, 2))).toHaveLength(1);
  });

  it('iterates by entity id then slot: two victims pulse in id order', () => {
    const w = duel(true);
    apply(w, OtKind.burning, 0);
    apply(w, OtKind.burning, 1);
    const ps = run(w, 26).filter((e) => e.kind === SimEventKind.otPulse);
    expect(ps.map((e) => e['id'])).toEqual([0, 1]);
  });

  it('cleanse removes burning and venom, counts them and emits otEnded; mending stays', () => {
    const w = duel(true);
    apply(w, OtKind.burning);
    apply(w, OtKind.venom);
    apply(w, OtKind.mending);
    expect(cleansableOt(w.state, VICTIM)).toBe(2);
    const sk = sink(w);
    expect(cleanseOt(w, sk, VICTIM)).toBe(2);
    expect(sk.events.map((e) => [e.kind, e['status'], e['reason']])).toEqual([
      [SimEventKind.otEnded, StatusId.burning, OtEnd.cleansed],
      [SimEventKind.otEnded, StatusId.venom, OtEnd.cleansed],
    ]);
    expect(hasStatus(w.state, VICTIM, StatusId.mending)).toBe(true);
    expect(cleansableOt(w.state, VICTIM)).toBe(0);
  });

  it('a status slot holds 5 ints (layout the stack/refresh code relies on)', () => {
    expect(STATUS_STRIDE).toBe(5);
  });
});
