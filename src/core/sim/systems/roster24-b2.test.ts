import { describe, expect, it } from 'vitest';
import { characterId } from '../../data/ids';
import { DEFAULT_SIM_FLAGS } from '../../flags';
import { Cmd, type Command } from '../commands';
import { createMatch, type MatchSetup } from '../match';
import { EntityFlag, EntityKind } from '../state';
import { step } from '../step';
import type { SimWorld } from '../world';
import { skipIntro } from './arcade/round-testkit';
import { applyBuff, thornsDamageOf } from './status';

/** Roster-24 batch 2 primitives (SIM_VERSION 73): lunge, hover-and-linger, thorns, the centred melee box. */
function duel(p1: string, p2: string, x1 = 300, x2 = 900): SimWorld {
  const setup: MatchSetup = {
    simVersion: 73, seed: 5, flags: { ...DEFAULT_SIM_FLAGS, rulesetArcade: true }, chapter: 1, difficulty: 1,
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

describe('lunge (tusk-gore, skitter)', () => {
  it('tusk-gore drives the caster forward, at most lungePx', () => {
    const w = duel('durrok', 'pax');
    const x0 = w.state.x[0] ?? 0;
    run(w, 60, Cmd.primary);
    const dx = (w.state.x[0] ?? 0) - x0;
    expect(dx).toBeGreaterThan(20);
    expect(dx).toBeLessThanOrEqual(180 + 16);
  });

  it('tusk-gore stops at a wall instead of leaving the arena', () => {
    const w = duel('durrok', 'pax', 20, 900);
    w.state.dir[0] = 4;
    run(w, 60, Cmd.primary);
    expect(w.state.x[0] ?? 0).toBeGreaterThanOrEqual(0);
  });

  it('skitter hops the caster backward without a hit box', () => {
    const w = duel('zephra', 'pax');
    const x0 = w.state.x[0] ?? 0;
    run(w, 40, Cmd.secondary);
    const dx = (w.state.x[0] ?? 0) - x0;
    expect(dx).toBeLessThan(-20);
    expect(dx).toBeGreaterThanOrEqual(-140 - 16);
    const melee = Array.from({ length: w.state.kind.length }, (_, i) => i).filter((i) => w.state.kind[i] === EntityKind.melee && ((w.state.flags[i] ?? 0) & EntityFlag.alive) !== 0);
    expect(melee).toEqual([]);
  });
});

describe('hover shot (lure-orb)', () => {
  it('stops after its travel, lingers as a hazard, then despawns', () => {
    const w = duel('glimmaw', 'pax', 300, 1500);
    run(w, 1, Cmd.primary);
    const find = (): number => Array.from({ length: w.state.kind.length }, (_, i) => i).find((i) => w.state.kind[i] === EntityKind.projectile && ((w.state.flags[i] ?? 0) & EntityFlag.alive) !== 0) ?? -1;
    let id = -1;
    for (let i = 0; i < 80 && id < 0; i++) { run(w, 1); id = find(); }
    expect(id).toBeGreaterThanOrEqual(0);
    run(w, 80);
    expect([w.state.vx[id], w.state.vy[id]]).toEqual([0, 0]);
    expect(find()).toBe(id);
    run(w, 120);
    expect(find()).toBe(-1);
  });
});

describe('thorns (molten-hide)', () => {
  it('a thorns bearer reports the damage; others report 0', () => {
    const w = duel('brazgor', 'pax');
    expect(thornsDamageOf(w.state, 0)).toBe(0);
    applyBuff(w, 0, 'molten-hide');
    expect(thornsDamageOf(w.state, 0)).toBe(4);
    expect(thornsDamageOf(w.state, 1)).toBe(0);
  });

  it('a melee attacker that lands a hit on the bearer pays for it', () => {
    const w = duel('brazgor', 'durrok', 300, 340);
    applyBuff(w, 0, 'molten-hide');
    const hp = w.state.hp[1] ?? 0;
    run(w, 30, 0, Cmd.primary);
    expect(w.state.hp[1] ?? 0).toBeLessThan(hp);
  });
});

describe('centred melee box (abyss-flash)', () => {
  it('hits a foe standing beside the caster on either side', () => {
    for (const x2 of [320, 400]) {
      const w = duel('glimmaw', 'pax', 340, x2);
      w.state.dir[0] = x2 > 340 ? 0 : 4;
      const hp = w.state.hp[1] ?? 0;
      run(w, 30, Cmd.secondary);
      expect(w.state.hp[1] ?? 0, `foe at ${String(x2)}`).toBeLessThan(hp);
    }
  });
});
