import { describe, expect, it } from 'vitest';
import { characterId } from '../../data/ids';
import { getCharacter } from '../../data/characters';
import { DEFAULT_SIM_FLAGS } from '../../flags';
import { createMatch, type MatchSetup } from '../../sim/match';
import { step } from '../../sim/step';
import { createObservationView } from '../agent';
import { AI_EASY, AI_HARD, RUSHDOWN, type ArcadeAiLevel } from './arcade-ai';
import { ScriptedAI, scriptedProfileFor } from './index';

/** Footsies over whole matches (SIM_VERSION 108: Normal AI). Two scripted heroes, no scripted rng outside the sim seed. */

function setup(seed: number, a: string, b: string): MatchSetup {
  return {
    simVersion: 1, seed, flags: { ...DEFAULT_SIM_FLAGS, rulesetArcade: true }, chapter: 1, difficulty: 1,
    p1: [{ character: characterId(a), xp: 1 }],
    p2: [{ character: characterId(b), xp: 1 }],
  };
}

const ai = (self: string, foe: string, level: ArcadeAiLevel, id: string): ScriptedAI =>
  new ScriptedAI(scriptedProfileFor(getCharacter(characterId(self)), getCharacter(characterId(foe))), { id, level, personality: RUSHDOWN });

export interface Trace { readonly cmds: number[]; readonly dist: number[]; readonly hp0: number[] }

/** Runs `ticks` ticks of agent A (side 0) against agent B (side 1; `null` sends no command). */
export function runPair(seed: number, a: string, b: string, la: ArcadeAiLevel, lb: ArcadeAiLevel | null, ticks: number): Trace {
  const world = createMatch(setup(seed, a, b));
  const pa = ai(a, b, la, 'a');
  const pb = lb === null ? null : ai(b, a, lb, 'b');
  const cmds: number[] = [], dist: number[] = [], hp0: number[] = [];
  for (let i = 0; i < ticks; i++) {
    const v0 = createObservationView(world, 0);
    const v1 = createObservationView(world, 1);
    const c0 = pa.observe(v0);
    const c1 = pb === null ? 0 : pb.observe(v1);
    cmds.push(c0, c1);
    const s = v0.self, o = v0.opponent;
    dist.push(s !== undefined && o !== undefined ? Math.max(Math.abs(o.x + o.w / 2 - s.x - s.w / 2), Math.abs(o.y + o.h / 2 - s.y - s.h / 2)) : -1);
    hp0.push(s?.hp ?? 0);
    step(world, [c0, c1]);
  }
  return { cmds, dist, hp0 };
}

export function fnv(values: readonly number[]): number {
  let h = 0x811c9dc5;
  for (const v of values) h = Math.imul(h ^ (v & 0xffff), 0x01000193) >>> 0;
  return h;
}

describe('Easy and Hard command streams do not move with the Normal footsies (SIM_VERSION 108, re-pinned at 117 for the stun nerf)', () => {
  it('Easy vs Easy, 600 ticks', () => {
    expect(fnv(runPair(11, 'sindarosa', 'wispera', AI_EASY, AI_EASY, 600).cmds)).toBe(EASY_HASH);
  });
  it('Hard vs Hard, 600 ticks', () => {
    expect(fnv(runPair(11, 'brazgor', 'sindarosa', AI_HARD, AI_HARD, 600).cmds)).toBe(HARD_HASH);
  });
});
const EASY_HASH = 3731000458;
const HARD_HASH = 1866799149;
