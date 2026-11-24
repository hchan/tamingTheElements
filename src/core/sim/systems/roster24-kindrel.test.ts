import { describe, expect, it } from 'vitest';
import { SuperShape, superOf } from '../../data/arcade-supers';
import { characterId } from '../../data/ids';
import { DEFAULT_SIM_FLAGS } from '../../flags';
import { Cmd, type Command } from '../commands';
import { createMatch, type MatchSetup } from '../match';
import { step } from '../step';
import type { SimWorld } from '../world';
import { skipIntro } from './arcade/round-testkit';

/** Kindrel kit contract beyond roster24-b1: Ember Bite chains, Cinder Spray rings the caster (omni), WILDFIRE super has a speed bonus. */
function duel(x2: number): SimWorld {
  const setup: MatchSetup = {
    simVersion: 89, seed: 5, flags: { ...DEFAULT_SIM_FLAGS, rulesetArcade: true }, chapter: 1, difficulty: 1,
    p1: [{ character: characterId('kindrel'), xp: 1 }],
    p2: [{ character: characterId('pax'), xp: 1 }],
  };
  const w = skipIntro(createMatch(setup));
  w.state.x[0] = 300; w.state.y[0] = 300; w.state.dir[0] = 0;
  w.state.x[1] = x2; w.state.y[1] = 300; w.state.dir[1] = 4;
  return w;
}
/** Hold one command for n ticks; returns the foe's hp after each tick. */
const hold = (w: SimWorld, n: number, c: Command): number[] => {
  const hp: number[] = [];
  for (let i = 0; i < n; i++) { step(w, [c, 0]); hp.push(w.state.hp[1] ?? 0); }
  return hp;
};

describe('kindrel kit', () => {
  it('Ember Bite chains: holding primary lands several separate hits', () => {
    const w = duel(360);
    let prev = w.state.hp[1] ?? 0;
    let hits = 0;
    for (const v of hold(w, 120, Cmd.primary)) { if (v < prev) hits++; prev = v; }
    expect(hits).toBeGreaterThanOrEqual(2);
  });

  it('Cinder Spray is omni: it hurts a foe in front of and behind Kindrel', () => {
    for (const x2 of [360, 240]) {
      const w = duel(x2);
      const before = w.state.hp[1] ?? 0;
      hold(w, 90, Cmd.secondary);
      expect(w.state.hp[1] ?? 0, `foe at x=${String(x2)}`).toBeLessThan(before);
    }
  });

  it('WILDFIRE super is a beam with a speed bonus', () => {
    const sup = superOf('kindrel');
    expect(sup.name).toBe('WILDFIRE');
    expect(sup.shape).toBe(SuperShape.beam);
    expect(sup.speedBonus).toBeGreaterThan(0);
  });
});
