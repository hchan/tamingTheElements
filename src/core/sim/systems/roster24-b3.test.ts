import { describe, expect, it } from 'vitest';
import { characterId } from '../../data/ids';
import { DEFAULT_SIM_FLAGS } from '../../flags';
import { Cmd, type Command } from '../commands';
import { createMatch, type MatchSetup } from '../match';
import { step } from '../step';
import type { SimWorld } from '../world';
import { skipIntro } from './arcade/round-testkit';
import { StatusId } from './status';

/** Roster-24 batch 3 primitives (SIM_VERSION 74): grab, pull, wound, stoop, heal. */
function duel(p1: string, p2: string, x1 = 300, x2 = 900): SimWorld {
  const setup: MatchSetup = {
    simVersion: 74, seed: 5, flags: { ...DEFAULT_SIM_FLAGS, rulesetArcade: true }, chapter: 1, difficulty: 1,
    p1: [{ character: characterId(p1), xp: 1 }],
    p2: [{ character: characterId(p2), xp: 1 }],
  };
  const world = skipIntro(createMatch(setup));
  const s = world.state;
  s.x[0] = x1; s.y[0] = 300; s.dir[0] = 0;
  s.x[1] = x2; s.y[1] = 300; s.dir[1] = 4;
  return world;
}
const run = (w: SimWorld, n: number, c0: Command = 0, c1: Command = 0): void => {
  for (let i = 0; i < n; i++) step(w, [i === 0 ? c0 : 0, i === 0 ? c1 : 0]);
};
const hasWound = (w: SimWorld): boolean => Array.from(w.state.status).includes(StatusId.wound);

describe('grab (wyrm-coil)', () => {
  it('damages and throws a foe away', () => {
    const w = duel('ouroth', 'pax', 300, 520);
    const hp = w.state.hp[1] ?? 0;
    run(w, 60, Cmd.primary);
    expect(w.state.hp[1] ?? 0).toBeLessThan(hp);
    expect((w.state.x[1] ?? 0) - 520).toBeGreaterThan(40);
  });

  it('still lands through a held Guard', () => {
    const w = duel('ouroth', 'pax', 300, 520);
    const hp = w.state.hp[1] ?? 0;
    for (let i = 0; i < 60; i++) step(w, [i === 0 ? Cmd.primary : 0, Cmd.guard]);
    expect(w.state.hp[1] ?? 0).toBeLessThan(hp);
  });
});

describe('wound (talon-rake)', () => {
  it('leaves a wound that keeps pulsing damage', () => {
    const w = duel('vortigal', 'pax', 300, 450);
    run(w, 30, Cmd.secondary);
    expect(hasWound(w)).toBe(true);
    const hp = w.state.hp[1] ?? 0;
    run(w, 40);
    expect(w.state.hp[1] ?? 0).toBeLessThan(hp);
  });
});

describe('stoop', () => {
  it('carries the caster toward the foe', () => {
    const w = duel('vortigal', 'pax');
    const x0 = w.state.x[0] ?? 0;
    run(w, 60, Cmd.primary);
    expect((w.state.x[0] ?? 0) - x0).toBeGreaterThan(20);
  });
});

describe('abyssal-pull', () => {
  it('drags a far foe toward the caster', () => {
    const w = duel('abyssor', 'pax', 300, 560);
    run(w, 80, Cmd.secondary);
    expect(w.state.x[1] ?? 0).toBeLessThan(560);
  });
});

describe('mycelium-mend', () => {
  it('heals the caster', () => {
    const w = duel('umbrel', 'pax');
    w.state.hp[0] = 20;
    run(w, 10, Cmd.secondary);
    expect(w.state.hp[0]).toBeGreaterThan(20);
  });
});
