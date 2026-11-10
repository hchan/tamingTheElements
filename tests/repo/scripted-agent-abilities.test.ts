import { describe, expect, it } from 'vitest';
import { collectCommands } from '../../src/core/agents/agent';
import { characterId } from '../../src/core/data/ids';
import { DEFAULT_SIM_FLAGS } from '../../src/core/flags';
import { createMatch } from '../../src/core/sim/match';
import { cooldownIdx } from '../../src/core/sim/state';
import { step } from '../../src/core/sim/step';
import { RACES, makeAgent } from '../../tools/sim/run-match';

/** Counts how often each ability slot of `race` (team 0) gets a cooldown booked while playing every other race. */
function slotUses(race: string): [number, number] {
  const uses: [number, number] = [0, 0];
  for (const foe of RACES) {
    if (foe === race) continue;
    const world = createMatch({
      simVersion: 0, seed: 1, flags: DEFAULT_SIM_FLAGS, chapter: 1, difficulty: 1,
      p1: [{ character: characterId(race), xp: 0 }], p2: [{ character: characterId(foe), xp: 0 }],
    });
    const agents = [makeAgent('scripted', race), makeAgent('scripted', foe)] as const;
    const s = world.state;
    const last = [0, 0];
    for (let t = 0; t < 3000 && (s.hp[0] ?? 0) > 0 && (s.hp[1] ?? 0) > 0; t++) {
      step(world, collectCommands(world, agents));
      for (const slot of [0, 1] as const) {
        const cd = s.abil[cooldownIdx(0, slot)] ?? 0;
        if (cd !== last[slot]) uses[slot]++;
        last[slot] = cd;
      }
    }
  }
  return uses;
}

describe('scripted tournament agent uses every ability', () => {
  for (const race of RACES) {
    it(`${race} casts both its primary and its secondary`, () => {
      const [primary, secondary] = slotUses(race);
      expect(primary).toBeGreaterThan(0);
      expect(secondary).toBeGreaterThan(0);
    });
  }
});
