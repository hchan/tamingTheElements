// New Arcade AI against the frozen previous one (tools/sim/arcade-ai-v1), same AI level on both sides, sides swapped on odd seeds.
// Usage: pnpm ai:duel [--ai-level 1..5] [--seeds N] [--team-size 1|2] [--json]
import { parseArgs } from 'node:util';
import { RACES, runMatch } from './run-match';

const { values } = parseArgs({ options: { 'ai-level': { type: 'string' }, seeds: { type: 'string' }, 'team-size': { type: 'string' }, json: { type: 'boolean' } } });
const aiLevel = Number(values['ai-level'] ?? 4);
const seeds = Number(values.seeds ?? 4);
const teamSize = values['team-size'] === '2' ? 2 : 1;
let newWins = 0;
let oldWins = 0;
let draws = 0;
let ticks = 0;
let n = 0;
for (const raceA of RACES) {
  for (const raceB of RACES) {
    for (let s = 0; s < seeds; s++) {
      // A (new) plays raceA, B (old) plays raceB; sides swap on odd seeds so side bias cancels.
      const r = runMatch({
        raceA, raceB, agentA: 'scripted', agentB: 'scripted', seed: 1000 + s, level: 1, difficulty: 1,
        aIsTeam0: s % 2 === 0, ruleset: 'arcade', aiLevel, teamSize, frozenV1: 'b',
      });
      n++;
      ticks += r.ticks;
      if (r.winner === 'a') newWins++;
      else if (r.winner === 'b') oldWins++;
      else draws++;
    }
  }
}
const newWinRate = Math.round((newWins * 1000) / (newWins + oldWins || 1)) / 10;
const out = { aiLevel, teamSize, matches: n, newWins, oldWins, draws, newWinRate, avgSeconds: Math.round(ticks / n / 50) };
console.log(values.json === true ? JSON.stringify(out) : `new AI vs old AI (level ${aiLevel}): ${newWins}-${oldWins} (draws ${draws}) of ${n}; new win rate of decided ${newWinRate}%; avg ${out.avgSeconds}s`);
