import { describe, expect, it } from 'vitest';
import { characterId } from '../data/ids';
import { GUARD_MAX, WEATHER_TICKS, Weather } from '../data/arcade';
import { DEFAULT_SIM_FLAGS } from '../flags';
import { ARCADE_WORLD_BASE, ArcadeE, ArcadeW } from './state';
import { Cmd } from './commands';
import { EventSink } from './events';
import { createMatch, type MatchSetup } from './match';
import { ABILITY_DEFS } from './systems/projectile';
import { applyArcadeHit } from './systems/arcade/hit';
import { skipIntro } from './systems/arcade/round-testkit';
import { step } from './step';
import { createRenderView, type RenderCharacter } from './view';
import { SIM_VERSION } from '../version';

function match(arcade: boolean): MatchSetup {
  return {
    simVersion: SIM_VERSION, seed: 7, flags: { ...DEFAULT_SIM_FLAGS, rulesetArcade: arcade }, chapter: 1, difficulty: 1,
    p1: [{ character: characterId('sindarosa'), xp: 1 }],
    p2: [{ character: characterId('pax'), xp: 1 }],
  };
}

describe('RenderView.arcade (FUN-DESIGN section 3)', () => {
  it('is undefined in Classic', () => {
    expect(createRenderView(createMatch(match(false))).arcade()).toBeUndefined();
  });

  it('reports the freeze, the live combo, the meters and the victim stun after a hit, reusing one object', () => {
    const world = skipIntro(createMatch(match(true)));
    const view = createRenderView(world);
    const before = view.arcade();
    expect(before).toMatchObject({ frozen: false, comboHits: [0, 0], comboDamage: [0, 0], meter: [0, 0] });
    expect(before?.stunned(1)).toBe(false);
    world.state.hp[1] = 10_000;
    applyArcadeHit(world, new EventSink(0), 0, 0, 1, 16, ABILITY_DEFS.findIndex((d) => d.id === 'fire-blast'), 0);
    const after = view.arcade();
    expect(after).toBe(before);
    expect(after?.frozen).toBe(true);
    expect(after?.comboHits).toEqual([1, 0]);
    expect(after?.comboDamage[0]).toBeGreaterThan(0);
    // Both meters rise: the attacker by 800 and the victim by 600 per mille of the life share removed.
    expect(after?.meter[0]).toBeGreaterThan(after?.meter[1] ?? 0);
    expect(after?.meter[1]).toBeGreaterThan(0);
    expect(after?.stunned(1)).toBe(true);
    expect(after?.invulnerable(1)).toBe(false);
  });

  it('reports the guard meter (full until drained) and whether a character guards (read-outs only)', () => {
    const world = skipIntro(createMatch(match(true)));
    const ar = createRenderView(world).arcade();
    expect(ar?.guard(0)).toBe(GUARD_MAX);
    expect(ar?.guarding(0)).toBe(false);
    world.state.arcade[ArcadeE.guardDrain] = 300;
    world.state.arcade[ArcadeE.blockUntil] = (world.state.arcade[ARCADE_WORLD_BASE + ArcadeW.gameTick] ?? 0) + 5;
    expect(ar?.guard(0)).toBe(GUARD_MAX - 300);
    expect(ar?.guarding(0)).toBe(true);
    expect(ar?.guarding(1)).toBe(false);
  });

  it('reports the weather up and the game ticks it has left (read-outs only)', () => {
    const world = skipIntro(createMatch(match(true)));
    const view = createRenderView(world);
    expect(view.arcade()).toMatchObject({ weather: Weather.none, weatherLeft: 0 });
    // Sindarosa (fire) calls Sunshine for WEATHER_TICKS game ticks, counted from the cast.
    step(world, [Cmd.weather, 0]);
    const left = view.arcade()?.weatherLeft ?? 0;
    expect(view.arcade()?.weather).toBe(Weather.sun);
    expect(left).toBeGreaterThan(WEATHER_TICKS - 3);
    expect(left).toBeLessThanOrEqual(WEATHER_TICKS);
    for (let i = 0; i < 10; i++) step(world, [0, 0]);
    expect(view.arcade()?.weatherLeft).toBe(left - 10);
    for (let i = 0; i < WEATHER_TICKS; i++) step(world, [0, 0]);
    expect(view.arcade()).toMatchObject({ weather: Weather.none, weatherLeft: 0 });
  });

  it('gives every character its element', () => {
    const els: string[] = [];
    createRenderView(createMatch(match(false))).forEachCharacter((c: RenderCharacter) => els.push(c.element));
    expect(els).toEqual(['fire', 'earth']);
  });
});
