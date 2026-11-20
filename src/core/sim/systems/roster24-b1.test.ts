import { describe, expect, it } from 'vitest';
import { getCharacter } from '../../data/characters';
import { HERO_STYLE } from '../../data/hero-style';
import { characterId } from '../../data/ids';
import { DEFAULT_SIM_FLAGS } from '../../flags';
import { Cmd, type Command } from '../commands';
import { createMatch, type MatchSetup } from '../match';
import { step } from '../step';
import type { SimWorld } from '../world';
import { skipIntro } from './arcade/round-testkit';

/** Roster-24 batch 1 kit contract (Kindrel, Nykra, Quarrak, Hyalia): element, style, abilities, and each primary or secondary hurts a foe in reach. */
function duel(p1: string, p2: string, x1 = 300, x2 = 900): SimWorld {
  const setup: MatchSetup = {
    simVersion: 89, seed: 5, flags: { ...DEFAULT_SIM_FLAGS, rulesetArcade: true }, chapter: 1, difficulty: 1,
    p1: [{ character: characterId(p1), xp: 1 }],
    p2: [{ character: characterId(p2), xp: 1 }],
  };
  const world = skipIntro(createMatch(setup));
  const s = world.state;
  s.x[0] = x1; s.y[0] = 300; s.dir[0] = 0;
  s.x[1] = x2; s.y[1] = 300; s.dir[1] = 4;
  return world;
}
const run = (w: SimWorld, n: number, c0: Command = 0): void => {
  for (let i = 0; i < n; i++) step(w, [i === 0 ? c0 : 0, 0]);
};

const KITS = [
  { id: 'kindrel', element: 'fire', style: 'melee', abilities: ['ember-bite', 'cinder-spray'], gap: 60 },
  { id: 'nykra', element: 'water', style: 'melee', abilities: ['hoof-crash', 'kelp-lash'], gap: 60 },
  { id: 'quarrak', element: 'earth', style: 'ranged', abilities: ['hurl-rock', 'boulder-roll'], gap: 300 },
  { id: 'hyalia', element: 'air', style: 'ranged', abilities: ['stinging-filament', 'bell-pulse'], gap: 100 },
] as const;

describe('roster-24 batch 1 kits', () => {
  for (const k of KITS) {
    it(`${k.id}: ${k.element} ${k.style}, abilities ${k.abilities.join(' + ')}`, () => {
      const c = getCharacter(characterId(k.id));
      expect(c.element).toBe(k.element);
      expect(HERO_STYLE[c.id]).toBe(k.style);
      expect(c.abilities.map(String)).toEqual([...k.abilities]);
    });

    it(`${k.id}: each ability hurts a foe standing in reach`, () => {
      for (const cmd of [Cmd.primary, Cmd.secondary]) {
        const w = duel(k.id, 'pax', 300, 300 + k.gap);
        const hp = w.state.hp[1] ?? 0;
        run(w, 90, cmd);
        expect(w.state.hp[1] ?? 0, `${k.id} cmd ${String(cmd)}`).toBeLessThan(hp);
      }
    });
  }
});
