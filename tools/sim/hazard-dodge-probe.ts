// Does the Arcade AI dodge telegraphed stage hazards? AI-vs-AI matches on each element stage; per hazard strike, is each
// controlled fighter inside the strike box at strike time, with the dodge on and with it disabled (the ablation: the
// ArcadeTactics.hazard rule is replaced by a no-op). Normal = AI level 3, Hard = 4.
// Usage: tsx tools/sim/hazard-dodge-probe.ts [--seeds 32] [--json]
import { parseArgs } from 'node:util';
import { collectCommands } from '../../src/core/agents/agent';
import { ArcadeTactics } from '../../src/core/agents/scripted-ai/arcade';
import { makeAgent, RACES } from './run-match';
import { DEFAULT_SIM_FLAGS } from '../../src/core/flags';
import { SIM_VERSION } from '../../src/core/index';
import { characterId } from '../../src/core/data/ids';
import { SimEventKind } from '../../src/core/sim/events';
import { createMatch } from '../../src/core/sim/match';
import { ARCADE_WORLD_BASE, ArcadeW, HAZARD_BASE, HazardF } from '../../src/core/sim/state';
import { step } from '../../src/core/sim/step';
import { controlledId } from '../../src/core/sim/systems/movement';

const { values } = parseArgs({ options: { seeds: { type: 'string' }, json: { type: 'boolean' } } });
const SEEDS = Number(values.seeds ?? 32);
const KIND = ['', 'fire', 'water', 'earth', 'air'];
const proto = ArcadeTactics.prototype as unknown as { hazard: (...a: unknown[]) => unknown };
const realHazard = proto.hazard;

interface Cell { strikes: number; fighters: number; inside: number; hit: number; shift: number; shiftN: number }
const cells = new Map<string, Cell>();

function run(stage: number, level: number, seed: number, dodge: boolean): void {
  proto.hazard = dodge ? realHazard : function (_v: unknown, _a: unknown, cmd: unknown) { return cmd; };
  const ra = RACES[seed % RACES.length] ?? 'fiara';
  const rb = RACES[(seed * 5 + 3) % RACES.length] ?? 'curomo';
  const world = createMatch({
    simVersion: SIM_VERSION, seed: 5000 + seed, flags: { ...DEFAULT_SIM_FLAGS, rulesetArcade: true }, chapter: 1, difficulty: 1,
    p1: [{ character: characterId(ra), xp: 1 }], p2: [{ character: characterId(rb), xp: 1 }],
  });
  const s = world.state;
  s.arcade[ARCADE_WORLD_BASE + ArcadeW.stage] = stage;
  const agents = [makeAgent('scripted', ra, rb, level), makeAgent('scripted', rb, ra, level)] as const;
  const H = (f: number): number => ARCADE_WORLD_BASE + HAZARD_BASE + f;
  let pending: { key: string; xs: Map<number, number>; until: number } | undefined;
  for (let t = 0; t < 18000; t++) {
    const events = step(world, collectCommands(world, [agents[0], agents[1]]));
    for (const e of events) {
      if (e.kind === SimEventKind.hazardStrike) {
        const kind = s.arcade[H(HazardF.kind)] ?? 0;
        const key = `${KIND[kind] ?? '?'}|${level === 3 ? 'normal' : 'hard'}|${dodge ? 'dodge' : 'nodge'}`;
        const c = cells.get(key) ?? { strikes: 0, fighters: 0, inside: 0, hit: 0, shift: 0, shiftN: 0 };
        c.strikes++;
        const hx = s.arcade[H(HazardF.x)] ?? 0, hy = s.arcade[H(HazardF.y)] ?? 0, hw = s.arcade[H(HazardF.w)] ?? 0, hh = s.arcade[H(HazardF.h)] ?? 0;
        const xs = new Map<number, number>();
        for (let team = 0; team < 2; team++) {
          const id = controlledId(world, team);
          if (id < 0 || (s.hp[id] ?? 0) <= 0) continue;
          c.fighters++;
          const x = s.x[id] ?? 0, y = s.y[id] ?? 0;
          if (x < hx + hw && hx < x + (s.w[id] ?? 0) && y < hy + hh && hy < y + (s.h[id] ?? 0)) c.inside++;
          xs.set(id, x);
        }
        for (const h of events) if (h.kind === SimEventKind.hazardHit) c.hit++;
        cells.set(key, c);
        if (kind === 2 || kind === 4) pending = { key, xs, until: t + 100 };
      }
    }
    if (pending !== undefined && t >= pending.until) {
      const c = cells.get(pending.key);
      if (c !== undefined) for (const [id, x0] of pending.xs) { c.shift += Math.abs((s.x[id] ?? 0) - x0); c.shiftN++; }
      pending = undefined;
    }
    if (events.some((e) => e.kind === SimEventKind.matchEnded)) break;
  }
}

for (const stage of [1, 2, 3, 4]) for (const level of [3, 4]) for (const dodge of [true, false]) {
  for (let seed = 0; seed < SEEDS; seed++) run(stage, level, seed, dodge);
  process.stderr.write(`done stage ${KIND[stage] ?? ''} level ${String(level)} dodge ${String(dodge)}\n`);
}
proto.hazard = realHazard;
const rows = [...cells.entries()].sort().map(([k, c]) => ({
  k, strikes: c.strikes, fighters: c.fighters, insidePct: Math.round((c.inside * 1000) / (c.fighters || 1)) / 10, hits: c.hit, avgShiftPx: Math.round(c.shift / (c.shiftN || 1)),
}));
if (values.json === true) console.log(JSON.stringify(rows));
else for (const r of rows) console.log(`${r.k.padEnd(24)} strikes ${String(r.strikes).padStart(5)} fighters ${String(r.fighters).padStart(5)} inside ${String(r.insidePct).padStart(5)}% hits ${String(r.hits).padStart(5)} shift(100t) ${String(r.avgShiftPx)}px`);
