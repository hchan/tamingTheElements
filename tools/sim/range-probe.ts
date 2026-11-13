// Attack-range probe (headless, docs/TESTING.md "Attack range probe"): per hero, where do its hits land?
//   tsx tools/sim/range-probe.ts [--seeds 4] [--seed 1] [--ai-level 3] [--out out/range-probe.json]
// Plays every Arcade 1v1 pairing with the scripted AI and, on each `hitConfirmed`, records the centre-to-centre
// distance (px) between attacker and victim, bucketed, per attacker race and ability kind (melee, ranged, other).
// Prints the static kit table too: melee box reach (w x h) and projectile speed / travel time over the playfield.
// Read-only: it never touches src/core.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { collectCommands } from '../../src/core/agents/agent';
import { arcadePlayfield } from '../../src/core/data/arcade';
import { CHARACTERS, getCharacter } from '../../src/core/data/characters';
import { characterId } from '../../src/core/data/ids';
import { DEFAULT_SIM_FLAGS } from '../../src/core/flags';
import { SIM_VERSION } from '../../src/core/index';
import { SimEventKind } from '../../src/core/sim/events';
import { createMatch } from '../../src/core/sim/match';
import { CHARGE_DEF, SUPER_DEF, TRAP_BOMB_DEF, TRAP_SPIKE_DEF } from '../../src/core/sim/systems/arcade/hit';
import { ABILITY_DEFS } from '../../src/core/sim/systems/projectile';
import { step } from '../../src/core/sim/step';
import { ARCADE_MAX_TICKS, RACES, makeTeamAgent, xpForLevel } from './run-match';

/** Upper edges (px, centre to centre) of the distance buckets; the last bucket is open. */
export const BUCKET_EDGES: readonly number[] = [60, 120, 200, 320, 480, 640];
export const bucketOf = (d: number): number => {
  const i = BUCKET_EDGES.findIndex((e) => d < e);
  return i < 0 ? BUCKET_EDGES.length : i;
};
export const bucketLabel = (i: number): string => `${String(i === 0 ? 0 : BUCKET_EDGES[i - 1])}-${i < BUCKET_EDGES.length ? String(BUCKET_EDGES[i]) : 'inf'}`;

type Group = 'melee' | 'ranged' | 'other';
const groupOf = (idx: number): Group => {
  if (idx === CHARGE_DEF || idx === SUPER_DEF || idx === TRAP_BOMB_DEF || idx === TRAP_SPIKE_DEF) return 'other';
  const k = ABILITY_DEFS[idx]?.kind;
  return k === 'melee' ? 'melee' : k === 'range' || k === 'debuff' || k === 'omni' ? 'ranged' : 'other';
};

export interface RaceRange {
  readonly race: string;
  readonly hits: Record<Group, number[]>;
  /** Distances of every hit (all groups), for percentiles. */
  readonly dists: number[];
}

const pct = (v: readonly number[], p: number): number => {
  if (v.length === 0) return 0;
  const s = [...v].sort((a, b) => a - b);
  return Math.round(s[Math.min(s.length - 1, Math.floor(p * s.length))] ?? 0);
};

export function probe(seeds: number, seed: number, aiLevel: number): Map<string, RaceRange> {
  const out = new Map<string, RaceRange>();
  for (const r of RACES) out.set(r, { race: r, hits: { melee: BUCKET_EDGES.map(() => 0).concat(0), ranged: BUCKET_EDGES.map(() => 0).concat(0), other: BUCKET_EDGES.map(() => 0).concat(0) }, dists: [] });
  RACES.forEach((a, i) => {
    for (const b of RACES.slice(i + 1)) {
      for (let k = 0; k < seeds; k++) {
        const xp = xpForLevel(1);
        const aFirst = k % 2 === 0;
        const rosterA = [{ character: characterId(a), xp }];
        const rosterB = [{ character: characterId(b), xp }];
        const world = createMatch({
          simVersion: SIM_VERSION, seed: seed + k, flags: { ...DEFAULT_SIM_FLAGS, rulesetArcade: true }, chapter: 1, difficulty: 1,
          p1: aFirst ? rosterA : rosterB, p2: aFirst ? rosterB : rosterA,
        });
        const s = world.state;
        const agentA = makeTeamAgent('scripted', [a], b, aFirst ? 0 : 1, aiLevel);
        const agentB = makeTeamAgent('scripted', [b], a, aFirst ? 1 : 0, aiLevel);
        const agents: [typeof agentA, typeof agentA] = aFirst ? [agentA, agentB] : [agentB, agentA];
        for (let t = 0; t < ARCADE_MAX_TICKS; t++) {
          // Fighter positions after the step (at most one tick of movement off the hit).
          const events = step(world, collectCommands(world, agents));
          let over = false;
          for (const e of events) {
            if (e.kind === SimEventKind.matchEnded) over = true;
            if (e.kind !== SimEventKind.hitConfirmed) continue;
            const att = e['attacker'] ?? 0;
            const tgt = e['target'] ?? 0;
            const ax = (s.x[att] ?? 0) + (s.w[att] ?? 0) / 2;
            const ay = (s.y[att] ?? 0) + (s.h[att] ?? 0) / 2;
            const tx = (s.x[tgt] ?? 0) + (s.w[tgt] ?? 0) / 2;
            const ty = (s.y[tgt] ?? 0) + (s.h[tgt] ?? 0) / 2;
            const d = Math.sqrt((ax - tx) ** 2 + (ay - ty) ** 2);
            const slot = rowFor(out, s.defId[att] ?? 0);
            if (slot === undefined) continue;
            slot.hits[groupOf(e['ability'] ?? -1)][bucketOf(d)]++;
            slot.dists.push(d);
          }
          if (over) break;
        }
      }
    }
  });
  return out;
}

/** The attacker's race row: `defId` of a character entity is its CHARACTERS index. */
function rowFor(out: Map<string, RaceRange>, defId: number): RaceRange | undefined {
  const id = CHARACTER_IDS[defId];
  return id === undefined ? undefined : out.get(id);
}
const CHARACTER_IDS: readonly string[] = CHARACTERS.map((c) => c.id);

export function kitTable(): string[] {
  const field = arcadePlayfield();
  const lines = ['race            slot ability            kind    dmg  speed  w x h     cooldown  travel across playfield'];
  for (const r of RACES) {
    getCharacter(characterId(r)).abilities.slice(0, 2).forEach((id, slot) => {
      const d = ABILITY_DEFS.find((x) => x.id === id);
      if (d === undefined) return;
      const travel = d.speed !== undefined && d.speed > 0 ? `${((field.w / d.speed) / 50).toFixed(2)} s (${String(field.w)} px / ${String(d.speed)} px per tick)` : '-';
      lines.push(`${r.padEnd(15)} ${String(slot)}    ${d.id.padEnd(18)} ${d.kind.padEnd(7)} ${String(d.damage ?? '-').padStart(4)} ${String(d.speed ?? '-').padStart(5)}  ${`${String(d.w ?? '-')}x${String(d.h ?? '-')}`.padEnd(9)} ${String(d.cooldownTicks).padStart(5)} t   ${travel}`);
    });
  }
  return lines;
}

function main(): void {
  const { values } = parseArgs({ options: { seeds: { type: 'string' }, seed: { type: 'string' }, 'ai-level': { type: 'string' }, out: { type: 'string' } } });
  const seeds = Number(values.seeds ?? 4);
  const res = probe(seeds, Number(values.seed ?? 1), Number(values['ai-level'] ?? 3));
  console.log(kitTable().join('\n'));
  console.log(`\nHits by centre distance (px) per attacker race, ${String(seeds)} seeds x all pairings. Columns: ${BUCKET_EDGES.map((_, i) => bucketLabel(i)).concat(bucketLabel(BUCKET_EDGES.length)).join(' | ')}`);
  for (const r of res.values()) {
    const tot = (g: Group): number => r.hits[g].reduce((x, y) => x + y, 0);
    const all = r.dists.length;
    const sum = (g: Group): string => r.hits[g].map((n) => String(n).padStart(5)).join(' ');
    console.log(`${r.race.padEnd(15)} n=${String(all).padStart(5)} p10 ${String(pct(r.dists, 0.1)).padStart(3)} p50 ${String(pct(r.dists, 0.5)).padStart(3)} p90 ${String(pct(r.dists, 0.9)).padStart(3)}  melee ${String(tot('melee')).padStart(5)} [${sum('melee')}]  ranged ${String(tot('ranged')).padStart(5)} [${sum('ranged')}]  other ${String(tot('other')).padStart(5)}`);
  }
  const path = values.out ?? 'out/range-probe.json';
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify({ buckets: BUCKET_EDGES, races: [...res.values()].map((r) => ({ race: r.race, hits: r.hits, p10: pct(r.dists, 0.1), p50: pct(r.dists, 0.5), p90: pct(r.dists, 0.9) })) }, null, 2));
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) main();
