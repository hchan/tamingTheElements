import { describe, expect, it } from 'vitest';
import { characterId } from '../../data/ids';
import { DEFAULT_SIM_FLAGS } from '../../flags';
import { createMatch, type MatchSetup } from '../../sim/match';
import { applyOt } from '../../sim/systems/arcade/over-time';
import { skipIntro } from '../../sim/systems/arcade/round-testkit';
import { EventSink } from '../../sim/events';
import type { SimWorld } from '../../sim/world';
import { createObservationView, type ArcadeView } from '../agent';
import { AI_EASY, AI_HARD, AI_NORMAL, cleanseSensible } from './arcade-ai';

function duel(on: boolean): SimWorld {
  const setup: MatchSetup = {
    simVersion: 76, seed: 9, flags: { ...DEFAULT_SIM_FLAGS, rulesetArcade: true, withOverTime: on }, chapter: 1, difficulty: 1,
    p1: [{ character: characterId('ishimi'), xp: 1 }],
    p2: [{ character: characterId('fiara'), xp: 1 }],
  };
  return skipIntro(createMatch(setup));
}

const A = (p: Partial<ArcadeView>): ArcadeView => ({ prevCmd: 0, cleanseIn: 0, selfRooted: 0, selfSlowed: false, ...p }) as ArcadeView;

describe('over-time observation fields', () => {
  it('are absent with the flag off', () => {
    const off = createObservationView(duel(false), 0).arcade;
    for (const k of ['selfBurn', 'selfVenom', 'foeBurn', 'foeMending']) expect(k in (off ?? {})).toBe(false);
  });

  it('show burning stacks and venom with the flag on', () => {
    const w = duel(true);
    const sink = new EventSink(0);
    const p1 = createObservationView(w, 0).self?.id ?? -1;
    const p2 = createObservationView(w, 1).self?.id ?? -1;
    expect(applyOt(w, sink, p2, p1, 0)).toBe(true);
    expect(applyOt(w, sink, p2, p1, 0)).toBe(true);
    expect(applyOt(w, sink, p2, p1, 1)).toBe(true);
    const a = createObservationView(w, 0).arcade;
    expect(a?.selfBurn).toBe(2);
    expect(a?.selfVenom).toBe(true);
    expect(a?.foeBurn).toBe(0);
    expect(createObservationView(w, 1).arcade?.foeBurn).toBe(2);
    expect(p1).toBeGreaterThanOrEqual(0);
  });
});

describe('cleanseSensible with over time', () => {
  it('flag-off views behave as before', () => {
    expect(cleanseSensible(AI_NORMAL, A({}), 100)).toBe(false);
    expect(cleanseSensible(AI_NORMAL, A({ selfRooted: 5 }))).toBe(true);
  });
  it('cleanses 2+ burn stacks, not 1', () => {
    expect(cleanseSensible(AI_HARD, A({ selfBurn: 2 }))).toBe(true);
    expect(cleanseSensible(AI_HARD, A({ selfBurn: 1 }))).toBe(false);
  });
  it('cleanses venom only while hurt', () => {
    expect(cleanseSensible(AI_NORMAL, A({ selfVenom: true }), 900)).toBe(false);
    expect(cleanseSensible(AI_NORMAL, A({ selfVenom: true }), 500)).toBe(true);
  });
  it('never on Easy or on cooldown', () => {
    expect(cleanseSensible(AI_EASY, A({ selfBurn: 3 }))).toBe(false);
    expect(cleanseSensible(AI_HARD, A({ selfBurn: 3, cleanseIn: 10 }))).toBe(false);
  });
});
