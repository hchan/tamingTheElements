// Why do Arcade AI matches stall? Replays (pair, seed) cases with the scripted AI and classifies each stalemate by where the
// fighters stand when it ends: clinch (both inside melee range), standoff (far apart: a ranged hero out of reach, or a keep-out
// band both respect), or mid. Also reports the HP-quiet window at the end of the match.
// Usage: pnpm ai:stalemates [--find tournament.json [--team-size 2]] [--cases tests/fixtures/ai/stalemate-seeds.json] [--ai-level 1..5] [--json]
//   a case is { a, b, seed, aIsTeam0?, teamSize?, note? }; seed is the exact match seed (as printed by the nightly fun-gates).
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { EntityKind, MAX_ENTITIES } from '../../src/core/sim/state';
import { runMatch, runPairing } from './run-match';

interface Case {
  readonly a: string;
  readonly b: string;
  readonly seed: number;
  readonly aIsTeam0?: boolean;
  readonly teamSize?: 1 | 2;
  readonly note?: string;
}

const { values } = parseArgs({
  options: { cases: { type: 'string' }, 'ai-level': { type: 'string' }, json: { type: 'boolean' }, find: { type: 'string' }, 'team-size': { type: 'string' } },
});
const file = values.cases ?? 'tests/fixtures/ai/stalemate-seeds.json';
const aiLevel = Number(values['ai-level'] ?? 3);

/** --find <tournament.json>: re-run the pairings that stalemated there (same base seed 1) and print their cases as JSON. */
function findCases(path: string): Case[] {
  const t = JSON.parse(readFileSync(path, 'utf8')) as { seedsPerPairing: number; pairs: { a: string; b: string; endReasons: { stalemate: number } }[] };
  const teamSize = values['team-size'] === '2' ? 2 : 1;
  const out: Case[] = [];
  for (const p of t.pairs) {
    if (p.endReasons.stalemate === 0) continue;
    const { results } = runPairing({ a: p.a, b: p.b, agents: ['scripted', 'scripted'], seeds: t.seedsPerPairing, seed: 1, level: 1, difficulty: 1, ruleset: 'arcade', aiLevel, teamSize });
    for (const r of results) if (r.endReason === 'stalemate') out.push({ a: p.a, b: p.b, seed: r.seed, aIsTeam0: r.aIsTeam0, teamSize });
  }
  return out;
}

if (values.find !== undefined) {
  console.log(JSON.stringify({ cases: findCases(values.find) }, null, 1));
  process.exit(0);
}
const cases = (JSON.parse(readFileSync(file, 'utf8')) as { cases: Case[] }).cases;

const CLINCH_PX = 160;
const STANDOFF_PX = 420;

interface Row {
  readonly a: string;
  readonly b: string;
  readonly seed: number;
  readonly endReason: string;
  readonly ticks: number;
  readonly gapPx: number;
  readonly kind: 'clinch' | 'mid' | 'standoff' | 'n/a';
  readonly quietTicks: number;
}

const rows: Row[] = [];
for (const c of cases) {
  let gap = 0;
  let lastHp = -1;
  let quiet = 0;
  const r = runMatch({
    raceA: c.a, raceB: c.b, agentA: 'scripted', agentB: 'scripted', seed: c.seed, level: 1, difficulty: 1,
    aIsTeam0: c.aIsTeam0 ?? true, ruleset: 'arcade', aiLevel, teamSize: c.teamSize ?? 1,
    onTick: (world) => {
      const s = world.state;
      const pos: { team: number; cx: number; cy: number }[] = [];
      let hp = 0;
      for (let id = 0; id < MAX_ENTITIES; id++) {
        if (s.kind[id] !== EntityKind.character) continue;
        hp += s.hp[id] ?? 0;
        pos.push({ team: s.team[id] ?? 0, cx: (s.x[id] ?? 0) + (s.w[id] ?? 0) / 2, cy: (s.y[id] ?? 0) + (s.h[id] ?? 0) / 2 });
      }
      quiet = hp === lastHp ? quiet + 1 : 0;
      lastHp = hp;
      let best = Infinity;
      for (const p of pos) for (const q of pos) if (p.team !== q.team) best = Math.min(best, Math.hypot(p.cx - q.cx, p.cy - q.cy));
      gap = best === Infinity ? 0 : Math.round(best);
    },
  });
  const stale = r.endReason === 'stalemate';
  rows.push({
    a: c.a, b: c.b, seed: c.seed, endReason: r.endReason, ticks: r.ticks, gapPx: gap,
    kind: !stale ? 'n/a' : gap <= CLINCH_PX ? 'clinch' : gap >= STANDOFF_PX ? 'standoff' : 'mid', quietTicks: quiet,
  });
}
if (values.json === true) console.log(JSON.stringify(rows));
else {
  for (const r of rows) console.log(`${r.a} vs ${r.b} seed ${String(r.seed)}: ${r.endReason} at ${String(r.ticks)} ticks, gap ${String(r.gapPx)} px (${r.kind}), quiet ${String(r.quietTicks)}`);
  const stalled = rows.filter((r) => r.endReason === 'stalemate');
  const n = (k: Row['kind']): string => String(stalled.filter((r) => r.kind === k).length);
  console.log(`${String(stalled.length)} of ${String(rows.length)} cases stalemate: clinch ${n('clinch')}, mid ${n('mid')}, standoff ${n('standoff')}`);
}
