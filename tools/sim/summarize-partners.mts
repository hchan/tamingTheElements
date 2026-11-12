// Prints the tables for `snag-trap-teams.mts partners` output: tsx tools/sim/summarize-partners.mts <partners.json> [topPairs]
import { readFileSync } from 'node:fs';
const d = JSON.parse(readFileSync(process.argv[2]!, 'utf8')), top = Number(process.argv[3] ?? 5);
const pct = (w: number, n: number): number => Math.round((1000 * w) / n) / 10;
const rows = Object.entries<any>(d.rows).map(([r, v]) => ({ r, any: pct(v.anyW, v.any), nAny: v.any, lead: pct(v.leadW, v.lead), nLead: v.lead })).sort((a, b) => b.any - a.any);
console.log(`${d.size}v${d.size}: matches ${d.tot.n}, KO ${d.tot.ko}, stalemate ${d.tot.stalemate}, timeout ${d.tot.timeout}, draws ${d.tot.draws}, tags/match ${(d.tot.tags / d.tot.n).toFixed(1)}, timeOvers/match ${(d.tot.timeOvers / d.tot.n).toFixed(2)}, p50 ${d.tot.secsP50}s p90 ${d.tot.secsP90}s`);
console.log('race | on-roster win % (n) | lead win % (n)');
for (const x of rows) console.log(`${x.r} | ${x.any} (${x.nAny}) | ${x.lead} (${x.nLead})`);
console.log(`spread on-roster ${rows[rows.length - 1]!.any}..${rows[0]!.any} = ${(rows[0]!.any - rows[rows.length - 1]!.any).toFixed(1)} pp; lead ${Math.min(...rows.map((x) => x.lead))}..${Math.max(...rows.map((x) => x.lead))}`);
const pr = Object.entries<any>(d.pairs).map(([k, v]) => ({ k, p: pct(v.w, v.g), n: v.g })).sort((a, b) => b.p - a.p);
console.log('best pairs: ' + pr.slice(0, top).map((x) => `${x.k} ${x.p}% (${x.n})`).join(', '));
console.log('worst pairs: ' + pr.slice(-top).map((x) => `${x.k} ${x.p}% (${x.n})`).join(', '));
