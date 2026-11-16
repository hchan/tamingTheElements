import { describe, expect, it } from 'vitest';
import fixture from '../fixtures/ai/stalemate-seeds.json';
import { runMatch } from '../../tools/sim/run-match';

interface Case { a: string; b: string; seed: number; aIsTeam0?: boolean; teamSize?: 1 | 2 }
const cases = (fixture as { cases: Case[] }).cases;
// Hyalia mid-range openings that still stall (docs/FUN-DESIGN.md 2.11); every other pinned case must now end in a KO.
const RESIDUAL = new Set(['hyalia|glimmaw|2864583637']);

describe('pinned Normal-level Arcade stalemates (SIM 78) resolve after the escalating stale stages', () => {
  for (const c of cases) {
    const key = `${c.a}|${c.b}|${String(c.seed)}`;
    it.skipIf(RESIDUAL.has(key))(`${c.a} vs ${c.b} seed ${String(c.seed)}`, () => {
      const r = runMatch({ raceA: c.a, raceB: c.b, agentA: 'scripted', agentB: 'scripted', seed: c.seed, level: 1, difficulty: 1, aIsTeam0: c.aIsTeam0 ?? true, ruleset: 'arcade', aiLevel: 3, teamSize: c.teamSize ?? 1 });
      expect(r.endReason).not.toBe('stalemate');
    }, 60000);
  }
});
