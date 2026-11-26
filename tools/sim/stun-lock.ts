// Stun lock probe (headless): over an Arcade round robin of the legacy 12 (Normal AI, level 3) it measures the share of
// fight ticks each character spends hit-stunned, the longest unbroken stun run, hits per combo and supers per match.
// Read-only. tsx tools/sim/stun-lock.ts [--seeds 2] [--team-size 1|2]
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { inFight } from '../../src/core/sim/clock';
import { EntityFlag, EntityKind, MAX_ENTITIES } from '../../src/core/sim/state';
import { isStunned } from '../../src/core/sim/systems/arcade/stun';
import { matchSeed, RACES, runMatch } from './run-match';

export interface StunLock {
  readonly matches: number;
  readonly lockShare: number;
  readonly longestRun: number;
  readonly runP90: number;
  readonly runs: number;
  readonly stunned: number;
  readonly total: number;
  readonly meanRun: number;
  readonly hitsPerCombo: number;
  readonly supersPerMatch: number;
}

export function measureStunLock(seeds: number, teamSize: 1 | 2 = 1): StunLock {
  let stunned = 0;
  let total = 0;
  let longest = 0;
  const runs: number[] = [];
  let hits = 0;
  let combos = 0;
  let supers = 0;
  let matches = 0;
  for (let i = 0; i < RACES.length; i++) {
    for (let j = 0; j < RACES.length; j++) {
      if (i === j) continue;
      for (let k = 0; k < seeds; k++) {
        const run = new Int32Array(MAX_ENTITIES);
        const r = runMatch({
          raceA: RACES[i] ?? '', raceB: RACES[j] ?? '', agentA: 'scripted', agentB: 'scripted', seed: matchSeed(1, i * 100 + j * 10 + k),
          level: 3, difficulty: 1, aIsTeam0: k % 2 === 0, ruleset: 'arcade', teamSize, aiLevel: 3,
          onTick: (world) => {
            const s = world.state;
            for (let id = 0; id < MAX_ENTITIES; id++) {
              if (s.kind[id] !== EntityKind.character || !inFight(s) || ((s.flags[id] ?? 0) & EntityFlag.alive) === 0) continue;
              total++;
              if (isStunned(s, id)) {
                stunned++;
                run[id] = (run[id] ?? 0) + 1;
                if ((run[id] ?? 0) > longest) longest = run[id] ?? 0;
              } else if ((run[id] ?? 0) > 0) {
                runs.push(run[id] ?? 0);
                run[id] = 0;
              }
            }
          },
        });
        matches++;
        const f = r.fun;
        if (f !== undefined) {
          for (const h of f.comboHits) {
            hits += h;
            combos++;
          }
          supers += f.supers;
        }
      }
    }
  }
  runs.sort((a, b) => a - b);
  return {
    matches,
    lockShare: Math.round((stunned / total) * 10000) / 10000,
    longestRun: longest,
    runs: runs.length,
    stunned,
    total,
    runP90: runs[Math.floor(runs.length * 0.9)] ?? 0,
    meanRun: Math.round((runs.reduce((a, b) => a + b, 0) / Math.max(1, runs.length)) * 100) / 100,
    hitsPerCombo: Math.round((hits / Math.max(1, combos)) * 100) / 100,
    supersPerMatch: Math.round((supers / matches) * 1000) / 1000,
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { values } = parseArgs({ options: { seeds: { type: 'string' }, 'team-size': { type: 'string' } } });
  console.log(JSON.stringify(measureStunLock(Number(values.seeds ?? 2), values['team-size'] === '2' ? 2 : 1)));
}
