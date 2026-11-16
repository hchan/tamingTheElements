// Wall-pin probe (`pnpm ai:wallpin`): Arcade 1v1, team 0 is idle or a scripted AI, team 1 is the scripted AI under test.
// Measures how long team 0 sits against a side wall, how much knockback the wall swallowed and how much of the time the
// two boxes overlap ("standing inside the foe"). WALL-2 acceptance: idle P1 -> overlap ~0, mean gap >= 160 px;
// scripted:3 (Normal) P1 vs level 4 (Hard) -> at-wall <= 8%, max stuck <= 2.0 s, swallowed <= 350 px.
// Usage: pnpm ai:wallpin [--p1 idle|scripted:<level>] [--p1races fiara,sindarosa] [--p2races rokcore,fiara,curomo]
//                        [--seeds 6] [--level 4] [--trace]
import { parseArgs } from 'node:util';
import { collectCommands } from '../../src/core/agents/agent';
import { arcadePlayfield } from '../../src/core/data/arcade';
import { characterId } from '../../src/core/data/ids';
import { DEFAULT_SIM_FLAGS } from '../../src/core/flags';
import { SIM_VERSION } from '../../src/core/index';
import { now } from '../../src/core/sim/clock';
import { NO_COMMAND } from '../../src/core/sim/commands';
import { SimEventKind } from '../../src/core/sim/events';
import { createMatch } from '../../src/core/sim/match';
import { ARCADE_E, ArcadeE, EntityKind, MAX_ENTITIES } from '../../src/core/sim/state';
import { step } from '../../src/core/sim/step';
import { makeAgent, matchSeed, xpForLevel } from './run-match';

const { values } = parseArgs({
  options: {
    p1: { type: 'string', default: 'idle' },
    p1races: { type: 'string', default: 'fiara,sindarosa' },
    p2races: { type: 'string', default: 'rokcore,fiara,curomo' },
    seeds: { type: 'string', default: '6' },
    level: { type: 'string', default: '4' },
    trace: { type: 'boolean', default: false },
  },
});
const p1Races = (values.p1races ?? '').split(',');
const p2Races = (values.p2races ?? '').split(',');
const seeds = Number(values.seeds);
const aiLevel = Number(values.level);
const p1Mode = values.p1 ?? 'idle';
const p1Level = p1Mode.startsWith('scripted:') ? Number(p1Mode.slice('scripted:'.length)) : -1;
if (p1Mode !== 'idle' && !(p1Level >= 0)) throw new Error('--p1 must be idle or scripted:<level>');
const PF = arcadePlayfield();
const idle = { id: 'idle', observe: () => NO_COMMAND, save: () => null, load: () => undefined };

interface Row {
  p1: string; p2: string; seed: number; ko: number; winner: number; firstWall: number; wallTicks: number;
  postWallTicks: number; overlapTicks: number; overlapFreeTicks: number; overlapFree2: number; gaps: number[]; wall48: number; overlapWall48: number; wallGaps: number[]; meanGap: number; hits: number; clampedPx: number; maxStuck: number;
}
const rows: Row[] = [];
for (const p1 of p1Races) for (const p2 of p2Races) for (let seed = 1; seed <= seeds; seed++) {
  const world = createMatch({
    simVersion: SIM_VERSION, seed: matchSeed(0x5eed, seed), flags: { ...DEFAULT_SIM_FLAGS, rulesetArcade: true },
    chapter: 1, difficulty: 1,
    p1: [{ character: characterId(p1), xp: xpForLevel(5) }],
    p2: [{ character: characterId(p2), xp: xpForLevel(5) }],
  });
  const s = world.state;
  const ai = makeAgent('scripted', p2, p1, aiLevel);
  const agents = (p1Level >= 0 ? [makeAgent('scripted', p1, p2, p1Level), ai] : [idle, ai]) as never;
  let a = -1, b = -1;
  for (let id = 0; id < MAX_ENTITIES; id++) {
    if (s.kind[id] !== EntityKind.character) continue;
    if (s.team[id] === 0 && a < 0) a = id; else if (s.team[id] === 1 && b < 0) b = id;
  }
  const wA = s.w[a] ?? 0;
  let ko = -1, winner = -1, firstWall = -1, wallTicks = 0, postWallTicks = 0, overlapTicks = 0, overlapFreeTicks = 0, gapSum = 0, hits = 0;
  let clampedPx = 0, stuck = 0, maxStuck = 0, overlapFree2 = 0; const gaps: number[] = []; let wall48 = 0, overlapWall48 = 0; const wallGaps: number[] = [];
  for (let t = 1; t <= 50 * 99; t++) {
    const xBefore = s.x[a] ?? 0;
    const kb = s.arcade[a * ARCADE_E + ArcadeE.kbVx] ?? 0;
    const ev = step(world, collectCommands(world, agents));
    const x = s.x[a] ?? 0;
    // knockback the wall swallowed this tick: attempted step minus the step taken (Q4 -> px)
    const wanted = kb / 16;
    if (kb !== 0 && Math.abs(x - xBefore) < Math.abs(wanted) - 1e-9 && (x <= PF.x + 0.001 || x >= PF.x + PF.w - wA - 0.001)) {
      clampedPx += Math.abs(wanted) - Math.abs(x - xBefore);
    }
    const atWall = x <= PF.x + 2 || x >= PF.x + PF.w - wA - 2;
    if (atWall) { wallTicks++; if (firstWall < 0) firstWall = t; stuck++; maxStuck = Math.max(maxStuck, stuck); } else stuck = 0;
    if (firstWall >= 0) {
      postWallTicks++;
      const dx = Math.abs((s.x[b] ?? 0) + (s.w[b] ?? 0) / 2 - (x + wA / 2));
      const dy = Math.abs((s.y[b] ?? 0) + (s.h[b] ?? 0) / 2 - ((s.y[a] ?? 0) + (s.h[a] ?? 0) / 2));
      gapSum += dx; gaps.push(dx);
      const near = x - PF.x <= 48 || PF.x + PF.w - (x + wA) <= 48;
      const ov = dx < (wA + (s.w[b] ?? 0)) / 2 && dy < ((s.h[a] ?? 0) + (s.h[b] ?? 0)) / 2;
      if (near) { wall48++; wallGaps.push(dx); if (ov) overlapWall48++; }
      if (dx < (wA + (s.w[b] ?? 0)) / 2 && dy < ((s.h[a] ?? 0) + (s.h[b] ?? 0)) / 2) {
        overlapTicks++;
        // a foe that is stunned or rooted is excluded from the AI's step-apart rule
        if ((s.arcade[a * ARCADE_E + ArcadeE.stunUntil] ?? 0) <= now(s)) overlapFreeTicks++;
        if ((s.arcade[a * ARCADE_E + ArcadeE.stunUntil] ?? 0) <= now(s) && (s.arcade[a * ARCADE_E + ArcadeE.rootUntil] ?? 0) <= now(s)) overlapFree2++;
      }
    }
    for (const e of ev) {
      if (e.kind === SimEventKind.hitConfirmed && e['target'] === a) hits++;
      if (e.kind === SimEventKind.matchEnded) { winner = e['winner'] ?? -1; ko = t; }
    }
    if (values.trace && seed === 1 && t % 50 === 0) {
      console.log(`${p1} v ${p2} s${seed} t=${t / 50}s p1x=${x.toFixed(0)} p2x=${(s.x[b] ?? 0).toFixed(0)} p1hp=${(s.hp[a] ?? 0).toFixed(0)}`);
    }
    if (ko >= 0) break;
  }
  rows.push({ p1, p2, seed, ko, winner, firstWall, wallTicks, postWallTicks, overlapTicks, overlapFreeTicks, overlapFree2, gaps, wall48, overlapWall48, wallGaps, meanGap: postWallTicks ? gapSum / postWallTicks : -1, hits, clampedPx, maxStuck });
}
const f = (n: number): string => (n / 50).toFixed(1);
const pct = (n: number, d: number): string => (d ? ((100 * n) / d).toFixed(0) : '-');
for (const r of rows) {
  console.log(`${r.p1.padEnd(10)} v ${r.p2.padEnd(10)} s${r.seed} ko=${r.ko < 0 ? 'none' : f(r.ko) + 's'} win=${r.winner} firstWall=${r.firstWall < 0 ? '-' : f(r.firstWall) + 's'} atWall%=${pct(r.wallTicks, r.postWallTicks)} overlap%=${pct(r.overlapTicks, r.postWallTicks)} overlapFoeFree%=${pct(r.overlapFreeTicks, r.postWallTicks)} maxStuck=${f(r.maxStuck)}s gap=${r.meanGap.toFixed(0)} hits=${r.hits} swallowedKbPx=${r.clampedPx.toFixed(0)}`);
}
const walled = rows.filter((r) => r.firstWall >= 0);
const mean = (g: (r: Row) => number): number => walled.reduce((x, r) => x + g(r), 0) / Math.max(1, walled.length);
const kos = rows.filter((r) => r.ko > 0).map((r) => r.ko).sort((x, y) => x - y);
console.log(
  `SUMMARY p1=${p1Mode} n=${rows.length} ko=${kos.length} medianKO=${kos.length ? f(kos[Math.floor(kos.length / 2)] ?? 0) : '-'}s reachedWall=${walled.length}` +
  ` atWall=${(mean((r) => r.wallTicks / Math.max(1, r.postWallTicks)) * 100).toFixed(0)}% overlap=${(mean((r) => r.overlapTicks / Math.max(1, r.postWallTicks)) * 100).toFixed(1)}% (foe free ${(mean((r) => r.overlapFreeTicks / Math.max(1, r.postWallTicks)) * 100).toFixed(1)}%)` +
  ` meanGap=${mean((r) => r.meanGap).toFixed(0)}px meanMaxStuck=${f(mean((r) => r.maxStuck))}s meanSwallowedKb=${(rows.reduce((x, r) => x + r.clampedPx, 0) / Math.max(1, rows.length)).toFixed(0)}px`,
);

const pooled = (label: string, rs: Row[]): void => {
  const w = rs.filter((r) => r.firstWall >= 0);
  const sum = (g: (r: Row) => number): number => w.reduce((x, r) => x + g(r), 0);
  const post = Math.max(1, sum((r) => r.postWallTicks));
  const g = w.flatMap((r) => r.wallGaps).sort((x, y) => x - y);
  const q = (p: number): string => (g.length ? (g[Math.floor(p * (g.length - 1))] ?? 0).toFixed(0) : '-');
  const kos = rs.filter((r) => r.ko > 0).map((r) => r.ko).sort((x, y) => x - y);
  console.log(`POOLED ${label.padEnd(10)} n=${rs.length} walled=${w.length} ko=${kos.length} medKO=${kos.length ? ((kos[Math.floor(kos.length / 2)] ?? 0) / 50).toFixed(1) : '-'}s atWall=${(100 * sum((r) => r.wallTicks) / post).toFixed(1)}% overlap=${(100 * sum((r) => r.overlapTicks) / post).toFixed(1)}% free(stun)=${(100 * sum((r) => r.overlapFreeTicks) / post).toFixed(1)}% free(stun+root)=${(100 * sum((r) => r.overlapFree2) / post).toFixed(1)}% atWall48=${(100 * sum((r) => r.wall48) / post).toFixed(1)}% overlapAtWall48=${(100 * sum((r) => r.overlapWall48) / Math.max(1, sum((r) => r.wall48))).toFixed(1)}% wallGapP10=${q(0.1)} wallGapP50=${q(0.5)} maxStuck=${(Math.max(0, ...w.map((r) => r.maxStuck)) / 50).toFixed(1)}s swallowed=${(rs.reduce((x, r) => x + r.clampedPx, 0) / Math.max(1, rs.length)).toFixed(0)}px`);
};
pooled('ALL', rows);
for (const p2 of p2Races) pooled(p2, rows.filter((r) => r.p2 === p2));
