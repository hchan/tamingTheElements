import { describe, expect, it } from 'vitest';
import { characterId } from '../data/ids';
import { DEFAULT_SIM_FLAGS } from '../flags';
import { EventSink } from './events';
import { createMatch, type MatchSetup } from './match';
import { ABILITY_DEFS } from './systems/projectile';
import { applyArcadeHit } from './systems/arcade/hit';
import { skipIntro } from './systems/arcade/round-testkit';
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

  it('gives every character its element', () => {
    const els: string[] = [];
    createRenderView(createMatch(match(false))).forEachCharacter((c: RenderCharacter) => els.push(c.element));
    expect(els).toEqual(['fire', 'earth']);
  });
});
