// Fun-gate noise study (headless). Plays the Arcade fun report in several independent seed blocks and reports, per
// metric, the block values (min / mean / max) against the committed tight bands of tools/ci/fun-gates.ts.
//   tsx tools/ci/fun-noise.ts [--blocks 4] [--block-size 8] [--team-size 1] [--ai-level 3] [--out out/fun-noise.json]
// One invocation = one (team size, aiLevel) configuration; run several in parallel (see docs/TESTING.md).
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { funReport } from '../sim/fun-report';
import { metricValues, tightGates } from './fun-gates';

const { values } = parseArgs({
  options: { blocks: { type: 'string' }, 'block-size': { type: 'string' }, 'team-size': { type: 'string' }, 'ai-level': { type: 'string' }, out: { type: 'string' } },
});
const blocks = Number(values.blocks ?? 4);
const size = Number(values['block-size'] ?? 8);
const ts = Number(values['team-size'] ?? 1) as 1 | 2 | 3;
const aiLevel = Number(values['ai-level'] ?? 3);
const per: Record<string, number>[] = [];
for (let b = 0; b < blocks; b++) {
  per.push(metricValues(funReport({ ruleset: 'arcade', teamSize: ts, aiLevel, seeds: size, seed: 1 + b * size, level: 1, all: true })));
}
const rows = tightGates(ts).map((g) => {
  const v = per.map((p) => p[g.metric] ?? Number.NaN);
  const mean = v.reduce((a, x) => a + x, 0) / v.length;
  const row = { metric: g.metric, band: [g.min, g.max], values: v, min: Math.min(...v), mean, max: Math.max(...v), blocksOut: v.filter((x) => !(x >= g.min && x <= g.max)).length };
  console.log(`${String(ts)}v${String(ts)} ai${String(aiLevel)} ${g.metric.padEnd(20)} min ${row.min.toFixed(3)} mean ${mean.toFixed(3)} max ${row.max.toFixed(3)} band [${String(g.min)}, ${String(g.max)}] blocksOut ${String(row.blocksOut)}/${String(blocks)}`);
  return row;
});
const out = values.out ?? `out/fun-noise-${String(ts)}v${String(ts)}-ai${String(aiLevel)}.json`;
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify({ teamSize: ts, aiLevel, blocks, blockSize: size, rows }, null, 2));
