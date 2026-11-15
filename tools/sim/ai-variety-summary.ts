// Reads the JSON that tools/sim/ai-measure.sh wrote and prints what the AI-variety work is judged on: stalemates, per-hero win
// spread, who stalls most, and whether Classic moved. Usage: pnpm ai:summary <dir> [<other dir>]  (two dirs: before / after)
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

interface Pair { a: string; b: string; endReasons: { ko: number; timeout: number; stalemate: number }; meanTicks: number; matches: number }
interface Rank { race: string; winRate: number }
interface Tournament { matches: number; ranking: Rank[]; pairs: Pair[] }

const FILES = ['arcade-hard-full', 'arcade-normal-full', 'arcade-easy-full', '2v2-hard'] as const;

function load(dir: string, name: string): Tournament | undefined {
  try {
    const j = JSON.parse(readFileSync(join(dir, `${name}.json`), 'utf8')) as { tournament?: Tournament } & Tournament;
    return j.tournament ?? j;
  } catch {
    return undefined;
  }
}

function describe(t: Tournament): string {
  const stale = t.pairs.reduce((n, p) => n + p.endReasons.stalemate, 0);
  const timeout = t.pairs.reduce((n, p) => n + p.endReasons.timeout, 0);
  const rates = t.ranking.map((r) => r.winRate * 100);
  const spread = rates.length > 0 ? Math.round(Math.max(...rates) - Math.min(...rates)) : 0;
  const inv = new Map<string, number>();
  for (const p of t.pairs) {
    for (const r of [p.a, p.b]) inv.set(r, (inv.get(r) ?? 0) + p.endReasons.stalemate);
  }
  const top = [...inv].filter(([, n]) => n > 0).sort((x, y) => y[1] - x[1]).slice(0, 6).map(([r, n]) => `${r}:${String(n)}`).join(' ');
  const meanSec = Math.round(t.pairs.reduce((n, p) => n + p.meanTicks * p.matches, 0) / Math.max(1, t.matches) / 50);
  return `${String(t.matches)} matches, stalemates ${String(stale)}, timeouts ${String(timeout)}, win spread ${String(spread)}pp, mean ${String(meanSec)}s; stall involvement ${top === '' ? 'none' : top}`;
}

function classicSig(dir: string): string {
  const out: string[] = [];
  for (const f of ['classic-s2', 'classic-s6']) {
    const t = load(dir, f);
    out.push(t === undefined ? 'missing' : JSON.stringify(t.pairs.map((p) => [p.a, p.b, p.endReasons, p.meanTicks])));
  }
  return out.join('|');
}

const dirs = process.argv.slice(2);
if (dirs.length === 0) {
  console.error('usage: ai:summary <dir> [<other dir>]');
  process.exit(2);
}
for (const dir of dirs) {
  console.log(`== ${dir}`);
  for (const f of FILES) {
    const t = load(dir, f);
    console.log(`${f.padEnd(20)} ${t === undefined ? 'missing' : describe(t)}`);
  }
}
if (dirs.length === 2) {
  const [x, y] = dirs as [string, string];
  console.log(`Classic (s2 + s6) identical between the two: ${String(classicSig(x) === classicSig(y))}`);
}
