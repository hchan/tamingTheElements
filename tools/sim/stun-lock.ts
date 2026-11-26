// Stun lock probe (headless): over an Arcade round robin (Normal AI, level 3) it measures the share of fight ticks each
// character spends hit-stunned, the longest unbroken stun run (in world ticks and in game ticks), hits per combo and supers per match.
// Read-only. tsx tools/sim/stun-lock.ts [--seeds 2] [--team-size 1|2] [--roster legacy|released]
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { inFight, now } from '../../src/core/sim/clock';
import { EntityFlag, EntityKind, MAX_ENTITIES } from '../../src/core/sim/state';
import { isStunned } from '../../src/core/sim/systems/arcade/stun';
import { matchSeed, RACES, RELEASED_RACES, runMatch } from './run-match';
import { StunRunCounter } from './stun-run';

export interface StunLock {
  readonly matches: number;
  readonly lockShare: number;
  /** Longest unbroken stun run in world ticks (includes hit-stop and the super freeze). */
  readonly longestRun: number;
  /** Longest unbroken stun run in game ticks (the sim clock, which holds still during hit-stop and the super freeze). */
  readonly longestRunGame: number;
  readonly runP90: number;
  readonly runs: number;
  readonly stunned: number;
  readonly total: number;
  readonly meanRun: number;
  readonly hitsPerCombo: number;
  readonly supersPerMatch: number;
}

export function measureStunLock(seeds: number, teamSize: 1 | 2 = 1, races: readonly string[] = RACES): StunLock {
  let stunned = 0;
  let total = 0;
  let longest = 0;
  let longestGame = 0;
  const runs: number[] = [];
  let hits = 0;
  let combos = 0;
  let supers = 0;
  let matches = 0;
  for (let i = 0; i < races.length; i++) {
    for (let j = 0; j < races.length; j++) {
      if (i === j) continue;
      for (let k = 0; k < seeds; k++) {
        const counters: StunRunCounter[] = [];
        const r = runMatch({
          raceA: races[i] ?? '', raceB: races[j] ?? '', agentA: 'scripted', agentB: 'scripted', seed: matchSeed(1, (i * races.length + j) * seeds + k),
          level: 3, difficulty: 1, aIsTeam0: k % 2 === 0, ruleset: 'arcade', teamSize, aiLevel: 3,
          onTick: (world) => {
            const s = world.state;
            for (let id = 0; id < MAX_ENTITIES; id++) {
              if (s.kind[id] !== EntityKind.character || !inFight(s) || ((s.flags[id] ?? 0) & EntityFlag.alive) === 0) continue;
              total++;
              const c = (counters[id] ??= new StunRunCounter());
              const st = isStunned(s, id);
              if (st) stunned++;
              const ended = c.tick(st, now(s));
              if (ended > 0) runs.push(ended);
              if (c.longestW > longest) longest = c.longestW;
              if (c.longestGame > longestGame) longestGame = c.longestGame;
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
  // A run still going when its match ends is never pushed to `runs`, so it is excluded from the p90 and the mean (it still counts in the longest).
  runs.sort((a, b) => a - b);
  return {
    matches,
    lockShare: Math.round((stunned / total) * 10000) / 10000,
    longestRun: longest,
    longestRunGame: longestGame,
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
  const { values } = parseArgs({ options: { seeds: { type: 'string' }, 'team-size': { type: 'string' }, roster: { type: 'string' } } });
  if (values.roster !== undefined && values.roster !== 'released' && values.roster !== 'legacy') {
    console.error(`unknown --roster ${values.roster} (legacy|released)`);
    process.exit(2);
  }
  const races = values.roster === 'released' ? RELEASED_RACES : RACES;
  console.log(JSON.stringify(measureStunLock(Number(values.seeds ?? 2), values['team-size'] === '2' ? 2 : 1, races)));
}
