import { describe, expect, it } from 'vitest';
import { CcKind, DAZE_TICKS, QUICK_RISE_WINDOW_TICKS, SILENCE_TICKS } from '../../data/arcade';
import { characterId } from '../../data/ids';
import { DEFAULT_SIM_FLAGS } from '../../flags';
import { Cmd } from '../../sim/commands';
import { hash } from '../../sim/hash';
import { createMatch, type MatchSetup } from '../../sim/match';
import { applyCc } from '../../sim/systems/arcade/cc';
import { skipIntro } from '../../sim/systems/arcade/round-testkit';
import { EventSink } from '../../sim/events';
import { now } from '../../sim/clock';
import { step } from '../../sim/step';
import type { SimWorld } from '../../sim/world';
import { createObservationView, type ArcadeView } from '../agent';
import { AI_EASY, AI_HARD, AI_NORMAL, ccAvoidImmune, ccEscape, cleanseSensible } from './arcade-ai';

function duel(on: boolean, p1 = 'pax', p2 = 'cyclonius', seed = 9): SimWorld {
  const setup: MatchSetup = {
    simVersion: 70, seed, flags: { ...DEFAULT_SIM_FLAGS, rulesetArcade: true, withCrowdControl: on }, chapter: 1, difficulty: 1,
    p1: [{ character: characterId(p1), xp: 1 }],
    p2: [{ character: characterId(p2), xp: 1 }],
  };
  return skipIntro(createMatch(setup));
}

const A = (p: Partial<ArcadeView>): ArcadeView => ({ prevCmd: 0, cleanseIn: 0, selfRooted: 0, selfSlowed: false, ...p }) as ArcadeView;
const cc = (kind: number, age = 0, left = 30): ArcadeView['selfCc'] => ({ kind, left, age });

describe('CC observation fields', () => {
  it('are absent with the flag off and present with it on', () => {
    const off = createObservationView(duel(false), 0).arcade;
    expect(off).toBeDefined();
    for (const k of ['selfCc', 'foeCc', 'foeCcImmune', 'slotCc']) expect(k in (off ?? {})).toBe(false);
    const on = createObservationView(duel(true), 0).arcade;
    expect(on?.selfCc?.kind).toBe(CcKind.none);
    expect(on?.foeCc?.kind).toBe(CcKind.none);
    expect(on?.foeCcImmune).toBe(0);
  });

  it('report kind and remaining ticks of a daze and a silence', () => {
    const w = duel(true);
    const sk = new EventSink(now(w.state));
    expect(applyCc(w, sk, 1, 1, 0, CcKind.daze, DAZE_TICKS)).toBe(true);
    expect(applyCc(w, sk, 1, 1, 1, CcKind.silenced, SILENCE_TICKS)).toBe(true);
    const v = createObservationView(w, 0).arcade;
    expect(v?.selfCc?.kind).toBe(CcKind.daze);
    expect(v?.selfCc?.left).toBe(DAZE_TICKS);
    expect(v?.foeCc?.kind).toBe(CcKind.silenced);
    expect(v?.foeCc?.left).toBe(SILENCE_TICKS);
  });

  it('flag off: the same scripted run hashes the same twice (no CC state touched)', () => {
    const a = duel(false);
    const b = duel(false);
    for (let t = 0; t < 120; t++) { step(a, [Cmd.primary, Cmd.secondary]); step(b, [Cmd.primary, Cmd.secondary]); }
    expect(hash(a.state)).toBe(hash(b.state));
  });
});

describe('ccEscape', () => {
  it('does nothing without CC, with the flag off, or on Easy', () => {
    expect(ccEscape(AI_HARD, A({}))).toBe(-1);
    expect(ccEscape(AI_HARD, A({ selfCc: cc(CcKind.none) }))).toBe(-1);
    expect(ccEscape(AI_EASY, A({ selfCc: cc(CcKind.daze) }))).toBe(-1);
  });

  it('Normal mashes primary on every other tick while dazed', () => {
    expect(ccEscape(AI_NORMAL, A({ selfCc: cc(CcKind.daze), prevCmd: 0 }))).toBe(Cmd.primary);
    expect(ccEscape(AI_NORMAL, A({ selfCc: cc(CcKind.daze), prevCmd: Cmd.primary }))).toBe(0);
  });

  it('Hard alternates primary and guard (never primary with secondary, a super chord)', () => {
    expect(ccEscape(AI_HARD, A({ selfCc: cc(CcKind.daze), prevCmd: 0 }))).toBe(Cmd.primary);
    expect(ccEscape(AI_HARD, A({ selfCc: cc(CcKind.daze), prevCmd: Cmd.primary }))).toBe(Cmd.guard);
    expect(ccEscape(AI_HARD, A({ selfCc: cc(CcKind.daze), prevCmd: Cmd.guard }))).toBe(Cmd.primary);
  });

  it('quick-rises a knockdown with Dash inside the window only', () => {
    expect(ccEscape(AI_HARD, A({ selfCc: cc(CcKind.downed, 0) }))).toBe(Cmd.dash);
    expect(ccEscape(AI_NORMAL, A({ selfCc: cc(CcKind.downed, 0) }))).toBe(-1);
    expect(ccEscape(AI_NORMAL, A({ selfCc: cc(CcKind.downed, 2) }))).toBe(Cmd.dash);
    expect(ccEscape(AI_HARD, A({ selfCc: cc(CcKind.downed, QUICK_RISE_WINDOW_TICKS + 1) }))).toBe(-1);
    expect(ccEscape(AI_HARD, A({ selfCc: cc(CcKind.downed, 1), prevCmd: Cmd.dash }))).toBe(-1);
  });

  it('a daze mash in a real match ends the daze early', () => {
    const w = duel(true);
    const sk = new EventSink(now(w.state));
    applyCc(w, sk, 1, 1, 0, CcKind.daze, DAZE_TICKS);
    let prev = 0;
    let t = 0;
    for (; t < DAZE_TICKS; t++) {
      const a = createObservationView(w, 0).arcade;
      if (a?.selfCc?.kind !== CcKind.daze) break;
      const cmd = ccEscape(AI_HARD, { ...a, prevCmd: prev });
      prev = cmd === -1 ? 0 : cmd;
      step(w, [prev, 0]);
    }
    expect(t).toBeLessThan(DAZE_TICKS - 10);
  });
});

describe('cleanse a silence', () => {
  it('is sensible on a silence when Cleanse is ready (Normal/Hard), not on Easy or on cooldown', () => {
    const sil = A({ selfCc: cc(CcKind.silenced) });
    expect(cleanseSensible(AI_NORMAL, sil)).toBe(true);
    expect(cleanseSensible(AI_HARD, sil)).toBe(true);
    expect(cleanseSensible(AI_EASY, sil)).toBe(false);
    expect(cleanseSensible(AI_HARD, A({ selfCc: cc(CcKind.silenced), cleanseIn: 30 }))).toBe(false);
    expect(cleanseSensible(AI_HARD, A({ selfCc: cc(CcKind.daze) }))).toBe(false);
    expect(cleanseSensible(AI_HARD, A({}))).toBe(false);
  });
});

describe('ccAvoidImmune', () => {
  const both = [true, true] as const;
  const imm = (k: number): number => 1 << k;

  it('is the identity with no immunity, no observation or on Easy', () => {
    expect(ccAvoidImmune(AI_HARD, A({}), Cmd.primary, both)).toBe(Cmd.primary);
    expect(ccAvoidImmune(AI_HARD, A({ slotCc: [CcKind.daze, 0], foeCcImmune: 0 }), Cmd.primary, both)).toBe(Cmd.primary);
    expect(ccAvoidImmune(AI_EASY, A({ slotCc: [CcKind.daze, 0], foeCcImmune: imm(CcKind.daze) }), Cmd.primary, both)).toBe(Cmd.primary);
  });

  it('drops a pure daze cast at a daze-immune foe, keeps other bits', () => {
    const a = A({ slotCc: [CcKind.daze, 0], foeCcImmune: imm(CcKind.daze) });
    expect(ccAvoidImmune(AI_NORMAL, a, Cmd.primary | Cmd.right, both)).toBe(Cmd.right);
    expect(ccAvoidImmune(AI_NORMAL, a, Cmd.secondary, both)).toBe(Cmd.secondary);
  });

  it('swaps a wasted damaging CC slot for the other ready slot, else keeps it', () => {
    const a = A({ slotCc: [CcKind.downed, 0], foeCcImmune: imm(CcKind.downed) });
    expect(ccAvoidImmune(AI_HARD, a, Cmd.primary, both)).toBe(Cmd.secondary);
    expect(ccAvoidImmune(AI_HARD, a, Cmd.primary, [true, false])).toBe(Cmd.primary);
    const b = A({ slotCc: [CcKind.downed, CcKind.downed], foeCcImmune: imm(CcKind.downed) });
    expect(ccAvoidImmune(AI_HARD, b, Cmd.primary, both)).toBe(Cmd.primary);
  });
});
