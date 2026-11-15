import { describe, expect, it } from 'vitest';
import { CcKind, HitStrength, OT_SPECS, OtEnd } from '../../../data/arcade';
import { characterId } from '../../../data/ids';
import { DEFAULT_SIM_FLAGS } from '../../../flags';
import { now } from '../../clock';
import { EventSink, SimEventKind, type SimEvent } from '../../events';
import { createMatch, type MatchSetup } from '../../match';
import { ARCADE_E, ARCADE_WORLD_BASE, ArcadeE, ArcadeW } from '../../state';
import { castSelf } from '../abilities';
import { hasStatus, StatusId } from '../status';
import type { SimWorld } from '../../world';
import { applyCc } from './cc';
import { applyArcadeHit, HIT_STRENGTH } from './hit';
import { overTimeSystem } from './over-time';
import { skipIntro } from './round-testkit';

const HEALER = 0;
const FOE = 1;
const MEND = OT_SPECS[2];
/** An ability def index with the given hit strength (any; the hit is applied directly). */
const strengthDef = (st: number): number => HIT_STRENGTH.findIndex((x) => x === st);

function duel(on: boolean, p1 = 'fiara', cc = false): SimWorld {
  const setup: MatchSetup = {
    simVersion: 75, seed: 9,
    flags: { ...DEFAULT_SIM_FLAGS, rulesetArcade: true, withOverTime: on, withCrowdControl: cc }, chapter: 1, difficulty: 1,
    p1: [{ character: characterId(p1), xp: 1 }],
    p2: [{ character: characterId('pax'), xp: 1 }],
  };
  const w = skipIntro(createMatch(setup));
  const s = w.state;
  s.x[0] = 300; s.y[0] = 300; s.dir[0] = 0;
  s.x[1] = 450; s.y[1] = 300; s.dir[1] = 4;
  s.hp[HEALER] = 20;
  return w;
}

/** Casts the healer's ability in `slot` (fiara: fire-heal slot 0; umbrel: mycelium-mend slot 1). */
const cast = (w: SimWorld, slot = 0): void => {
  castSelf(w, new EventSink(now(w.state)), 0, slot, now(w.state));
};
const hit = (w: SimWorld, def: number): SimEvent[] => {
  const sk = new EventSink(now(w.state));
  applyArcadeHit(w, sk, FOE, FOE, HEALER, 1, def, 0);
  return [...sk.events];
};

describe('OT2 mending on heal abilities', () => {
  it('flag off: fire-heal is the old instant heal and leaves no status', () => {
    const w = duel(false);
    cast(w);
    expect(w.state.hp[HEALER]).toBe(20 + 10 * (w.state.healMult[HEALER] ?? 0));
    expect(hasStatus(w.state, HEALER, StatusId.mending)).toBe(false);
  });

  it('flag on: half the heal now, then mending pulses of 2', () => {
    const w = duel(true);
    cast(w);
    expect(w.state.hp[HEALER]).toBe(20 + Math.trunc(10 * (w.state.healMult[HEALER] ?? 0) * 0.5));
    expect(hasStatus(w.state, HEALER, StatusId.mending)).toBe(true);
    const before = w.state.hp[HEALER] ?? 0;
    let pulses = 0;
    for (let i = 0; i < (MEND?.durationTicks ?? 0) + 1; i++) {
      w.state.arcade[ARCADE_WORLD_BASE + ArcadeW.gameTick] = now(w.state) + 1;
      const sk = new EventSink(now(w.state));
      overTimeSystem(w, null, sk);
      pulses += sk.events.filter((e) => e.kind === SimEventKind.otPulse).length;
    }
    expect(pulses).toBe(5);
    expect(w.state.hp[HEALER]).toBe(before + 5 * (MEND?.amount ?? 0));
  });

  it('flag on: mycelium-mend heals half now and mends', () => {
    const w = duel(true, 'umbrel');
    cast(w, 1);
    expect(w.state.hp[HEALER]).toBe(20 + Math.trunc(8 * (w.state.healMult[HEALER] ?? 0) * 0.5));
    expect(hasStatus(w.state, HEALER, StatusId.mending)).toBe(true);
  });

  it('a heavy hit breaks mending with otEnded broken; a light hit does not', () => {
    const light = duel(true);
    cast(light);
    hit(light, strengthDef(HitStrength.light));
    expect(hasStatus(light.state, HEALER, StatusId.mending)).toBe(true);
    const heavy = duel(true);
    cast(heavy);
    const ev = hit(heavy, strengthDef(HitStrength.heavy));
    expect(hasStatus(heavy.state, HEALER, StatusId.mending)).toBe(false);
    expect(ev.find((e) => e.kind === SimEventKind.otEnded)?.['reason']).toBe(OtEnd.broken);
  });

  it('a guarded heavy hit does not break it', () => {
    const w = duel(true);
    cast(w);
    w.state.arcade[HEALER * ARCADE_E + ArcadeE.blockUntil] = now(w.state) + 50;
    hit(w, strengthDef(HitStrength.heavy));
    expect(hasStatus(w.state, HEALER, StatusId.mending)).toBe(true);
  });

  it('silence blocks the cast', () => {
    const w = duel(true, 'fiara', true);
    applyCc(w, new EventSink(now(w.state)), FOE, FOE, HEALER, CcKind.silenced, 60);
    const hp = w.state.hp[HEALER];
    cast(w);
    expect(w.state.hp[HEALER]).toBe(hp);
    expect(hasStatus(w.state, HEALER, StatusId.mending)).toBe(false);
  });
});
