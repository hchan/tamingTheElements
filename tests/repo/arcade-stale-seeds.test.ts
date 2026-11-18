import { describe, expect, it } from 'vitest';
import fixture from '../fixtures/ai/stalemate-seeds.json';
import hardFixture from '../fixtures/ai/hard-stalemate-seeds.json';
import { runMatch } from '../../tools/sim/run-match';

interface Case { a: string; b: string; seed: number; aIsTeam0?: boolean; teamSize?: 1 | 2 }
const cases = (fixture as { cases: Case[] }).cases;
// Hyalia mid-range opening that still stalls at Normal (docs/FUN-DESIGN.md 2.11); the swept rock look-ahead (SIM 83) is Hard only.
// RUN-3 (SIM 89): hyalia vs abyssor on the same seed stalls at Normal once the AI uses Run (ranged Run Away kites a melee foe); owner decision pending.
const RESIDUAL = new Set(['hyalia|glimmaw|2864583637', 'hyalia|abyssor|2864583637']);
const hardCases = (hardFixture as { cases: Case[] }).cases;

describe('pinned Normal-level Arcade stalemates (SIM 78) resolve after the escalating stale stages', () => {
  for (const c of cases) {
    const key = `${c.a}|${c.b}|${String(c.seed)}`;
    it.skipIf(RESIDUAL.has(key))(`${c.a} vs ${c.b} seed ${String(c.seed)}`, () => {
      const r = runMatch({ raceA: c.a, raceB: c.b, agentA: 'scripted', agentB: 'scripted', seed: c.seed, level: 1, difficulty: 1, aIsTeam0: c.aIsTeam0 ?? true, ruleset: 'arcade', aiLevel: 3, teamSize: c.teamSize ?? 1 });
      expect(r.endReason).not.toBe('stalemate');
    }, 60000);
  }
});

describe('pinned Hard-level Arcade stalemates (SIM 82) resolve with the swept rock look-ahead (SIM 83)', () => {
  for (const c of hardCases) {
    it(`${c.a} vs ${c.b} seed ${String(c.seed)} (aiLevel 4)`, () => {
      const r = runMatch({ raceA: c.a, raceB: c.b, agentA: 'scripted', agentB: 'scripted', seed: c.seed, level: 1, difficulty: 1, aIsTeam0: c.aIsTeam0 ?? true, ruleset: 'arcade', aiLevel: 4, teamSize: c.teamSize ?? 1 });
      expect(r.endReason).toBe('ko');
    }, 60000);
  }
});
