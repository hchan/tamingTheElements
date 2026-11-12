import { readFileSync } from 'node:fs';
const f = process.argv[2];
const j = JSON.parse(readFileSync(f, 'utf8'));
const pad = (x, n) => String(x).padEnd(n);
console.log(f, 'matches', j.nMatches);
console.log(pad('race', 11), pad('win%', 6), pad('placed', 7), pad('/match', 7), pad('used%', 6), pad('kinds', 30), pad('ovl', 4), pad('tmo', 4), pad('dry', 4), pad('dsd', 4), pad('bombH', 6), pad('spkH', 5), pad('trapDmg', 8), pad('dmgShare%', 10), pad('trapKO', 6));
let tp = 0, th = 0, to = 0, dry = 0, td = 0, dmgT = 0, dmgAll = 0, ko = 0;
for (const [r, x] of Object.entries(j.rows)) {
  const td_ = x.dmgBomb + x.dmgSpike;
  tp += x.placed; th += x.overlap; to += x.timeout; dry += x.puddleDry ?? 0; td += x.doused; dmgT += td_; dmgAll += x.dmgTotalDealt; ko += x.trapKOs;
  console.log(pad(r, 11), pad((100 * x.wins / x.games).toFixed(1), 6), pad(x.placed, 7), pad((x.placed / x.games).toFixed(2), 7), pad((100 * x.matchesWithTrap / x.games).toFixed(0), 6), pad(JSON.stringify(x.kinds), 30), pad(x.overlap, 4), pad(x.timeout, 4), pad(x.puddleDry ?? 0, 4), pad(x.doused, 4), pad(x.hitsBomb, 6), pad(x.hitsSpike, 5), pad(td_.toFixed(0), 8), pad((100 * td_ / Math.max(1, x.dmgTotalDealt)).toFixed(1), 10), pad(x.trapKOs, 6));
}
const mean = j.placeTicks.reduce((a, b) => a + b, 0) / Math.max(1, j.placeTicks.length);
console.log('TOTAL placed', tp, 'overlap', th, 'timeout', to, 'puddleDry', dry, 'doused', td, 'trapDmg', dmgT.toFixed(0), 'allDmg', dmgAll.toFixed(0), 'share%', (100 * dmgT / dmgAll).toFixed(2), 'KOhits', ko, 'meanPlaceTick', mean.toFixed(0), 'avgPlacedPerMatch', (tp / j.nMatches).toFixed(2));
// Timeout share, with Puddle dry-ups kept apart (a Puddle always ends by its life, so it is not a match timeout).
// Old files without `puddleDry` count every timeout as true, as before.
const ended = th + to + dry + td;
const pct = (n, d) => (100 * n / Math.max(1, d)).toFixed(1);
console.log('timeout share of placed: true', pct(to, tp), '% | puddle dry-ups', pct(dry, tp), '% | combined (old metric)', pct(to + dry, tp), '%; of ended: true', pct(to, ended), '% | dry-ups', pct(dry, ended), '%');
