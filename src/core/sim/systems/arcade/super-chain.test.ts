import { describe, expect, it } from 'vitest';
import { COMBO_STUN_CAP_TICKS, METER_BAR, SUPER_COMBO_STUN_CAP_TICKS } from '../../../data/arcade';
import { characterId } from '../../../data/ids';
import { DEFAULT_SIM_FLAGS } from '../../../flags';
import { now } from '../../clock';
import { Cmd } from '../../commands';
import { createMatch, type MatchSetup } from '../../match';
import { ARCADE_E, ARCADE_T, ARCADE_TEAM_BASE, ArcadeE, ArcadeT } from '../../state';
import { step } from '../../step';
import { skipIntro } from './round-testkit';
import { isStunned } from './stun';

const METER = ARCADE_TEAM_BASE + 0 * ARCADE_T + ArcadeT.meter;

/** Team 0 holds super with three bars while the victim is kept inside the super box; returns the longest stun run and total. */
function superChain(caster: string, victim: string): { longestGame: number; maxTotal: number } {
  const setup: MatchSetup = {
    simVersion: 8, seed: 3, flags: { ...DEFAULT_SIM_FLAGS, rulesetArcade: true }, chapter: 1, difficulty: 1,
    p1: [{ character: characterId(caster), xp: 1 }], p2: [{ character: characterId(victim), xp: 1 }],
  };
  const world = skipIntro(createMatch(setup));
  const s = world.state;
  s.x[0] = 400;
  s.arcade[METER] = 3 * METER_BAR;
  let run = 0;
  let longestGame = 0;
  let maxTotal = 0;
  let lastG = now(s);
  for (let i = 0; i < 600; i++) {
    s.x[1] = 470; s.y[1] = s.y[0] ?? 0; s.hp[1] = 1_000_000;
    step(world, [Cmd.super, 0]);
    const g = now(s);
    if (g !== lastG) {
      if (isStunned(s, 1)) run += g - lastG; else run = 0;
      lastG = g;
    }
    longestGame = Math.max(longestGame, run);
    maxTotal = Math.max(maxTotal, s.arcade[1 * ARCADE_E + ArcadeE.comboStunTotal] ?? 0);
  }
  return { longestGame, maxTotal };
}

describe('a three-super chain (SIM_VERSION 118)', () => {
  it('the super cap sits above the plain cap', () => {
    expect(SUPER_COMBO_STUN_CAP_TICKS).toBe(80);
    expect(SUPER_COMBO_STUN_CAP_TICKS).toBeGreaterThan(COMBO_STUN_CAP_TICKS);
  });

  it.each([['sindarosa', 'pax'], ['wispera', 'echo'], ['hyalia', 'fiara']])('%s into %s: the stun chain never passes the super cap', (caster, victim) => {
    const { maxTotal, longestGame } = superChain(caster, victim);
    expect(maxTotal).toBeGreaterThan(0);
    expect(maxTotal).toBeLessThanOrEqual(SUPER_COMBO_STUN_CAP_TICKS);
    expect(longestGame).toBeLessThanOrEqual(SUPER_COMBO_STUN_CAP_TICKS + 1);
  });
});
