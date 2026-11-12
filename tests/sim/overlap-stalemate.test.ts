import { describe, expect, it } from 'vitest';
import { runPairing } from '../../tools/sim/run-match';

// Nightly fun-gates (seeds 1..8, aiLevel 3) once stalemated with both fighters overlapped in a wall corner.
describe('overlapped corner stalemates are gone (Arcade)', () => {
  const base = { agents: ['scripted', 'scripted'] as const, seeds: 8, seed: 1, level: 1, difficulty: 1, ruleset: 'arcade' as const, aiLevel: 3 };
  it('Lavax vs Wispera 1v1, seed 372467515', () => {
    const { results } = runPairing({ ...base, a: 'lavax', b: 'wispera', teamSize: 1 });
    expect(results.filter((r) => r.endReason === 'stalemate')).toEqual([]);
  }, 120000);
  it('Lavax vs Rokcore 2v2, seed 3149153258', () => {
    const { results } = runPairing({ ...base, a: 'lavax', b: 'rokcore', teamSize: 2 });
    expect(results.filter((r) => r.endReason === 'stalemate')).toEqual([]);
  }, 120000);
});
