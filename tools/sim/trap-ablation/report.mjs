import { readFileSync } from 'node:fs';
const f = process.argv[2];
const j = JSON.parse(readFileSync(f, 'utf8'));
const pad = (x, n) => String(x).padEnd(n);
console.log(f, 'matches', j.nMatches);
console.log(pad('race', 11), pad('win%', 6), pad('placed', 7), pad('/match', 7), pad('used%', 6), pad('kinds', 30), pad('ovl', 4), pad('tmo', 4), pad('dsd', 4), pad('bombH', 6), pad('spkH', 5), pad('trapDmg', 8), pad('dmgShare%', 10), pad('trapKO', 6));
let tp = 0, th = 0, to = 0, td = 0, dmgT = 0, dmgAll = 0, ko = 0;
for (const [r, x] of Object.entries(j.rows)) {
  const td_ = x.dmgBomb + x.dmgSpike;
  tp += x.placed; th += x.overlap; to += x.timeout; td += x.doused; dmgT += td_; dmgAll += x.dmgTotalDealt; ko += x.trapKOs;
  console.log(pad(r, 11), pad((100 * x.wins / x.games).toFixed(1), 6), pad(x.placed, 7), pad((x.placed / x.games).toFixed(2), 7), pad((100 * x.matchesWithTrap / x.games).toFixed(0), 6), pad(JSON.stringify(x.kinds), 30), pad(x.overlap, 4), pad(x.timeout, 4), pad(x.doused, 4), pad(x.hitsBomb, 6), pad(x.hitsSpike, 5), pad(td_.toFixed(0), 8), pad((100 * td_ / Math.max(1, x.dmgTotalDealt)).toFixed(1), 10), pad(x.trapKOs, 6));
}
const mean = j.placeTicks.reduce((a, b) => a + b, 0) / Math.max(1, j.placeTicks.length);
console.log('TOTAL placed', tp, 'overlap', th, 'timeout', to, 'doused', td, 'trapDmg', dmgT.toFixed(0), 'allDmg', dmgAll.toFixed(0), 'share%', (100 * dmgT / dmgAll).toFixed(2), 'KOhits', ko, 'meanPlaceTick', mean.toFixed(0), 'avgPlacedPerMatch', (tp / j.nMatches).toFixed(2));
