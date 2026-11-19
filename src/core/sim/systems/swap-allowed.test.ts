import { describe, expect, it } from 'vitest';
import { characterId } from '../../data/ids';
import { DEFAULT_SIM_FLAGS } from '../../flags';
import { now } from '../clock';
import { Cmd, type Command } from '../commands';
import { SimEventKind } from '../events';
import { createMatch, type MatchSetup } from '../match';
import { createRenderView } from '../view';
import { ARCADE_E, ArcadeE, EntityFlag, TeamField } from '../state';
import { step } from '../step';
import type { SimWorld } from '../world';
import { SwapBlock, swapAllowed } from './swap';
import { skipIntro } from './arcade/round-testkit';

const IDLE: readonly [Command, Command] = [0, 0];

function setupOf(arcade: boolean, p1: string[]): MatchSetup {
  return {
    simVersion: 18, seed: 4, flags: { ...DEFAULT_SIM_FLAGS, rulesetArcade: arcade }, chapter: 1, difficulty: 1,
    p1: p1.map((c) => ({ character: characterId(c), xp: 1 })),
    p2: ['pax', 'curomo'].map((c) => ({ character: characterId(c), xp: 1 })),
  };
}

/** Team 0 is entities 0 (active), 1, 2 (bench); team 1 follows. Positions are set far apart so nothing hits. */
function duel(arcade = true, p1 = ['sindarosa', 'cyclonius', 'pax']): SimWorld {
  const m = createMatch(setupOf(arcade, p1));
  const w = arcade ? skipIntro(m) : m;
  w.state.x[0] = 300;
  w.state.y[0] = 200;
  return w;
}

/** Presses swap1 for team 0 for one tick; true when the sim tagged. */
const tagged = (w: SimWorld): boolean => step(w, [Cmd.swap1, 0]).some((e) => e.kind === SimEventKind.swapped);
const setFlag = (w: SimWorld, id: number, f: number): void => { w.state.flags[id] = (w.state.flags[id] ?? 0) | f; };

describe('swapAllowed', () => {
  it('is 0 when a tag is allowed', () => {
    const w = duel();
    expect(swapAllowed(w, 0)).toBe(0);
    expect(swapAllowed(w, 0, 0)).toBe(0);
    expect(swapAllowed(w, 0, 1)).toBe(0);
  });
  it('WAIT outside the fight phase', () => {
    const w = createMatch(setupOf(true, ['sindarosa', 'pax']));
    step(w, IDLE);
    expect(swapAllowed(w, 0) & SwapBlock.wait).toBe(SwapBlock.wait);
    expect(tagged(w)).toBe(false);
  });
  it('cooldown', () => {
    const w = duel();
    w.state.teams[TeamField.swapCooldownUntil] = now(w.state) + 10;
    expect(swapAllowed(w, 0) & SwapBlock.cooldown).toBe(SwapBlock.cooldown);
    expect(swapAllowed(w, 1) & SwapBlock.cooldown).toBe(0);
  });
  it('STUN while hit-stunned', () => {
    const w = duel();
    w.state.arcade[0 * ARCADE_E + ArcadeE.stunUntil] = now(w.state) + 30;
    expect(swapAllowed(w, 0) & SwapBlock.stun).toBe(SwapBlock.stun);
    expect(swapAllowed(w, 0) & SwapBlock.busy).toBe(0);
  });
  it('frozen (the Classic status flag)', () => {
    const w = duel();
    setFlag(w, 0, EntityFlag.frozen);
    expect(swapAllowed(w, 0) & SwapBlock.frozen).toBe(SwapBlock.frozen);
    expect(tagged(w)).toBe(false);
  });
  it('busy while block-stunned', () => {
    const w = duel();
    w.state.arcade[0 * ARCADE_E + ArcadeE.blockUntil] = now(w.state) + 20;
    expect(swapAllowed(w, 0)).toBe(SwapBlock.busy);
  });
  it('no active hero', () => {
    const w = duel();
    for (const id of [0, 1, 2]) setFlag(w, id, EntityFlag.dead);
    expect(swapAllowed(w, 0) & SwapBlock.noActive).toBe(SwapBlock.noActive);
  });
  it('no partner in the slot', () => {
    const w = duel();
    expect(swapAllowed(w, 0, 2) & SwapBlock.noTarget).toBe(SwapBlock.noTarget);
    expect(swapAllowed(w, 1, 1) & SwapBlock.noTarget).toBe(SwapBlock.noTarget);
    setFlag(w, 1, EntityFlag.dead);
    expect(swapAllowed(w, 0, 0)).toBe(0);
    setFlag(w, 2, EntityFlag.dead);
    expect(swapAllowed(w, 0, 0) & SwapBlock.noTarget).toBe(SwapBlock.noTarget);
  });
  it('matches what the sim does with a swap1 press', () => {
    const preps: ((w: SimWorld) => void)[] = [
      () => undefined,
      (w) => { w.state.teams[TeamField.swapCooldownUntil] = now(w.state) + 5; },
      (w) => { w.state.arcade[ArcadeE.stunUntil] = now(w.state) + 5; },
      (w) => { w.state.arcade[ArcadeE.blockUntil] = now(w.state) + 5; },
      (w) => { setFlag(w, 1, EntityFlag.dead); setFlag(w, 2, EntityFlag.dead); },
    ];
    for (const prep of preps) {
      const w = duel();
      prep(w);
      for (let i = 0; i < 12; i++) {
        const allowed = swapAllowed(w, 0, 0) === 0;
        expect(tagged(w)).toBe(allowed);
        if (allowed) break;
      }
    }
    const c = duel(false);
    expect(swapAllowed(c, 0, 0)).toBe(0);
    expect(tagged(c)).toBe(true);
    expect(swapAllowed(c, 0, 0) & SwapBlock.cooldown).toBe(SwapBlock.cooldown);
  });
  it('the render view hands the HUD the same bits', () => {
    const w = duel();
    const ar = createRenderView(w).arcade();
    w.state.arcade[ArcadeE.stunUntil] = now(w.state) + 30;
    expect(ar?.swapBlock(0)).toBe(swapAllowed(w, 0));
    expect(ar?.swapBlock(0)).toBeGreaterThan(0);
  });
});
