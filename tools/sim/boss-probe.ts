// Boss probe (FUN-DESIGN 2.18): a 3-hero Arcade team against the Eternal Void, lone or with two Void-bodied shades.
//   pnpm exec tsx tools/sim/boss-probe.ts [seeds] [voidHpPm]
// One row per boss layout x AI level (applies to both sides) x lead. voidHpPm overrides the Void's life per mille (default 4000 = 4000 HP);
// a 3-hero roster scales life by 0.6, so each Void body of the void+2 layout has 2400 HP (a stand-in for the shades, which do not exist yet).
import { ARCADE_RACE_NUMBERS } from '../../src/core/sim/arcade-numbers';
import { runMatch } from './run-match';

const LEADS = ['fiara', 'rokcore', 'curomo', 'cyclonius']; // fire, earth, water, air
const LAYOUTS: Record<string, readonly string[]> = { lone: ['eternal-void'], 'void+2': ['eternal-void', 'eternal-void', 'eternal-void'] };
const seeds = Number(process.argv[2] ?? 6);
if (process.argv[3] !== undefined) (ARCADE_RACE_NUMBERS as Record<string, readonly [number, number]>)['eternal-void'] = [Number(process.argv[3]), 1000];
const rows: string[] = ['layout ai lead       heroWins ko  medianSec p90Sec medianHeroDmg'];
for (const [layout, roster] of Object.entries(LAYOUTS)) {
  for (const aiLevel of [1, 3, 4]) {
    for (const lead of LEADS) {
      const rs = [];
      for (let i = 0; i < seeds; i++) {
        rs.push(
          runMatch({ raceA: lead, raceB: 'eternal-void', agentA: 'scripted', agentB: 'scripted', seed: 1000 + i, level: 1, difficulty: 1, aIsTeam0: i % 2 === 0, ruleset: 'arcade', teamSize: 3, rosterB: roster, aiLevel }),
        );
      }
      const secs = rs.map((r) => r.ticks / 50).sort((a, b) => a - b);
      const dmg = rs.map((r) => r.damageBySide.a).sort((a, b) => a - b);
      const win = rs.filter((r) => r.winner === 'a').length;
      const ko = rs.filter((r) => r.endReason === 'ko').length;
      rows.push(
        `${layout.padEnd(6)} ${String(aiLevel)}  ${lead.padEnd(10)} ${win}/${seeds}      ${ko}/${seeds} ${(secs[Math.floor(seeds / 2)] ?? 0).toFixed(0).padStart(6)} ${(secs[Math.floor(seeds * 0.9)] ?? 0).toFixed(0).padStart(7)} ${String(Math.round(dmg[Math.floor(seeds / 2)] ?? 0)).padStart(8)}`,
      );
    }
  }
}
console.log(rows.join('\n'));
