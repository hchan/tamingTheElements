// Spacing ("footsies") baseline probe: how far apart do two Arcade 1v1 fighters stand in the first 400 ticks after the first move?
// Run: pnpm ai:footsies [--foe scripted|idle] [--seeds 3] [--races 5] [--team-size 1|2] [--json]
//  --foe idle: side B sends no command (IdleAgent in run-match.ts); only side A (the AI) is counted in still/reversals.
// Reports, for aiLevel 3 (Normal) and 4 (Hard): median centre distance at +150 ticks, share of still ticks, share of ticks
// under 320 / 320-600 / over 600 px, direction reversals per fighter per 10 s, end reasons. "Still" = position unchanged
// (includes hitstun and hit-stop). Sample: the first races of tests/fixtures/ai/stalemate-seeds.json, all pairs, matchSeed(7, i).
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { EntityKind, MAX_ENTITIES } from '../../src/core/sim/state';
import { type AgentKind, matchSeed, runMatch } from './run-match';

const WINDOW = 400;
const PROBE_TICK = 150;
const MELEE_PX = 320;
const FAR_PX = 600;

export interface FootsieRow {
  readonly aiLevel: number;
  readonly matches: number;
  readonly ends: Record<string, number>;
  readonly medDistAt150: number;
  readonly stillPct: number;
  readonly meleePct: number;
  readonly midPct: number;
  readonly farPct: number;
  readonly reversalsPer10s: number;
}

const median = (v: number[]): number => {
  const s = [...v].sort((a, b) => a - b);
  return s.length > 0 ? s[Math.floor(s.length / 2)]! : NaN;
};

function racePairs(count: number): [string, string][] {
  const file = new URL('../../tests/fixtures/ai/stalemate-seeds.json', import.meta.url);
  const cases = (JSON.parse(readFileSync(file, 'utf8')) as { cases: { a: string; b: string }[] }).cases;
  const races = [...new Set(cases.flatMap((c) => [c.a, c.b]))].sort().slice(0, count);
  const pairs: [string, string][] = [];
  for (let i = 0; i < races.length; i++) for (let j = i; j < races.length; j++) pairs.push([races[i]!, races[j]!]);
  return pairs;
}

export function measure(aiLevel: number, foe: AgentKind, seeds: number, raceCount: number, teamSize: 1 | 2 = 1): FootsieRow {
  const d150: number[] = [];
  const ends: Record<string, number> = {};
  let still = 0, samples = 0, melee = 0, mid = 0, far = 0, ticks = 0, rev = 0, matches = 0;
  for (const [a, b] of racePairs(raceCount)) {
    for (let i = 0; i < seeds; i++) {
      const prev = new Map<number, [number, number]>();
      const dir = new Map<number, number>();
      let start = -1, t = 0;
      const r = runMatch({
        raceA: a, raceB: b, agentA: 'scripted', agentB: foe, seed: matchSeed(7, i), level: 1, difficulty: 1,
        aIsTeam0: true, ruleset: 'arcade', aiLevel, teamSize,
        onTick: (world) => {
          const s = world.state;
          t++;
          const ch: { id: number; cx: number; cy: number }[] = [];
          for (let id = 0; id < MAX_ENTITIES; id++) {
            if (s.kind[id] !== EntityKind.character || (s.hp[id] ?? 0) <= 0) continue;
            ch.push({ id, cx: (s.x[id] ?? 0) + (s.w[id] ?? 0) / 2, cy: (s.y[id] ?? 0) + (s.h[id] ?? 0) / 2 });
          }
          if (ch.length !== 2) return;
          const info = ch.map((c) => {
            const p = prev.get(c.id);
            prev.set(c.id, [c.cx, c.cy]);
            return p === undefined ? { moved: false, dx: 0 } : { moved: p[0] !== c.cx || p[1] !== c.cy, dx: c.cx - p[0] };
          });
          if (start < 0) {
            if (info.some((x) => x.moved)) start = t;
            else return;
          }
          const k = t - start;
          if (k >= WINDOW) return;
          const p = ch[0]!, q = ch[1]!;
          const dist = Math.max(Math.abs(p.cx - q.cx), Math.abs(p.cy - q.cy));
          if (k === PROBE_TICK) d150.push(dist);
          ticks++;
          if (dist < MELEE_PX) melee++;
          else if (dist <= FAR_PX) mid++;
          else far++;
          for (let n = 0; n < 2; n++) {
            const self = ch[n]!, foeCh = ch[1 - n]!;
            if (foe === 'idle' && s.team[self.id] !== 0) continue; // count the AI side only
            samples++;
            if (!info[n]!.moved) still++;
            const radial = Math.sign(info[n]!.dx) * Math.sign(foeCh.cx - self.cx);
            if (radial !== 0) {
              const last = dir.get(self.id) ?? 0;
              if (last !== 0 && last !== radial) rev++;
              dir.set(self.id, radial);
            }
          }
        },
      });
      matches++;
      ends[r.endReason] = (ends[r.endReason] ?? 0) + 1;
    }
  }
  const pc = (x: number, n: number): number => Math.round((1000 * x) / n) / 10;
  return {
    aiLevel, matches, ends, medDistAt150: Math.round(median(d150)), stillPct: pc(still, samples),
    meleePct: pc(melee, ticks), midPct: pc(mid, ticks), farPct: pc(far, ticks),
    reversalsPer10s: Math.round((rev / samples) * 500 * 100) / 100,
  };
}

const { values } = parseArgs({
  options: {
    foe: { type: 'string', default: 'scripted' },
    seeds: { type: 'string', default: '3' },
    races: { type: 'string', default: '5' },
    'team-size': { type: 'string', default: '1' },
    json: { type: 'boolean', default: false },
  },
});
if (values.foe !== 'scripted' && values.foe !== 'idle') throw new Error(`--foe must be scripted|idle, got "${values.foe}"`);
const teamSize = values['team-size'] === '2' ? 2 : 1;
const rows = [3, 4].map((lv) => measure(lv, values.foe as AgentKind, Number(values.seeds), Number(values.races), teamSize));
if (values.json) console.log(JSON.stringify({ foe: values.foe, rows }, null, 2));
else {
  console.log(`foe=${values.foe} window=${String(WINDOW)} ticks after the first move`);
  for (const r of rows) {
    console.log(
      `aiLevel ${String(r.aiLevel)} (${r.aiLevel === 3 ? 'Normal' : 'Hard'}): n=${String(r.matches)} ends=${JSON.stringify(r.ends)} medDist@150=${String(r.medDistAt150)} still=${String(r.stillPct)}% <320=${String(r.meleePct)}% 320-600=${String(r.midPct)}% >600=${String(r.farPct)}% reversals/fighter/10s=${String(r.reversalsPer10s)}`,
    );
  }
}
