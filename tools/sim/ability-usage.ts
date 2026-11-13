// Ability usage metrics (headless, docs/TESTING.md "Ability usage metrics"): per hero and slot, how often is each ability cast?
//   tsx tools/sim/ability-usage.ts [--ruleset arcade|classic] [--seeds 4] [--seed 1] [--ai-level 3] [--out out/ability-usage.json]
// Plays every 1v1 pairing with the scripted AI. A cast is a rise of the slot's cooldown deadline (`SimState.abil`), which
// covers buffs, heals and Dash-like slots that raise no projectile or hit event. Uptime is the share of ticks the slot's
// active count is above zero (a projectile or melee box in flight) or, for a buff, its status is on the hero. Hits and damage come from Arcade `hitConfirmed` events
// (Classic has none for melee, so Classic reports casts and uptime only). Read-only: it never touches src/core.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { collectCommands } from '../../src/core/agents/agent';
import { CHARACTERS, getCharacter } from '../../src/core/data/characters';
import { characterId } from '../../src/core/data/ids';
import { DEFAULT_SIM_FLAGS } from '../../src/core/flags';
import { SIM_VERSION } from '../../src/core/index';
import { SimEventKind } from '../../src/core/sim/events';
import { createMatch } from '../../src/core/sim/match';
import { ABILITY_DEFS } from '../../src/core/sim/systems/projectile';
import { StatusId } from '../../src/core/sim/systems/status';
import { EntityFlag, EntityKind, MAX_ENTITIES, STATUS_SLOTS, STATUS_STRIDE, cooldownIdx, countIdx } from '../../src/core/sim/state';
import { step } from '../../src/core/sim/step';
import { ARCADE_MAX_TICKS, DEFAULT_MAX_TICKS, RACES, makeTeamAgent, xpForLevel } from './run-match';

export type UsageRuleset = 'arcade' | 'classic';
/** Slots measured: the two ability slots of a hero (slot 2 is Capture/Snag, scored elsewhere). */
export const SLOTS = 2;
const TICKS_PER_MINUTE = 3000;

/** Buff abilities and the status each applies (the same table as systems/status.ts BUFF_STATUS, which is not exported). */
const BUFF_STATUS: Readonly<Record<string, number>> = {
  adrenaline: StatusId.adrenaline, 'fire-dance': StatusId.fireDance, 'rock-armour': StatusId.rockArmour, 'translucent-flame': StatusId.translucent, fade: StatusId.translucent,
};

/** Whether entity `id` carries status `statusId` now. */
function hasStatus(status: Int32Array, id: number, statusId: number): boolean {
  for (let k = 0; k < STATUS_SLOTS; k++) if (status[(id * STATUS_SLOTS + k) * STATUS_STRIDE] === statusId) return true;
  return false;
}

export interface SlotUsage {
  readonly race: string;
  readonly slot: number;
  readonly ability: string;
  readonly kind: string;
  /** Fighter-matches played (one per hero per match). */
  matches: number;
  /** Fighter-ticks in the match. */
  ticks: number;
  casts: number;
  /** Ticks the active count was above zero or the buff's status was on. */
  activeTicks: number;
  hits: number;
  damage: number;
}

export type Verdict = 'dead' | 'rare' | 'ok' | 'overused';
export interface UsageRow extends SlotUsage {
  readonly castsPerMinute: number;
  readonly uptime: number;
  readonly hitsPerCast: number;
  /** Share of this hero's casts that went to this slot. */
  readonly castShare: number;
  readonly verdict: Verdict;
}

/** Below DEAD_PER_MIN casts a minute a slot is dead, below RARE_PER_MIN rare; a slot with over OVERUSED_SHARE of the hero's casts is overused. */
export const DEAD_PER_MIN = 0.3;
export const RARE_PER_MIN = 2;
export const OVERUSED_SHARE = 0.85;

export function emptyUsage(): Map<string, SlotUsage[]> {
  const out = new Map<string, SlotUsage[]>();
  for (const r of RACES) {
    out.set(
      r,
      getCharacter(characterId(r))
        .abilities.slice(0, SLOTS)
        .map((id, slot) => ({
          race: r, slot, ability: id, kind: ABILITY_DEFS.find((d) => d.id === id)?.kind ?? 'other',
          matches: 0, ticks: 0, casts: 0, activeTicks: 0, hits: 0, damage: 0,
        })),
    );
  }
  return out;
}

/** Verdicts for one hero's slots (all rows of the same race). */
export function judge(rows: readonly SlotUsage[]): UsageRow[] {
  const totalCasts = rows.reduce((n, r) => n + r.casts, 0);
  return rows.map((r) => {
    const castsPerMinute = r.ticks === 0 ? 0 : (r.casts / r.ticks) * TICKS_PER_MINUTE;
    const castShare = totalCasts === 0 ? 0 : r.casts / totalCasts;
    const verdict: Verdict =
      castsPerMinute < DEAD_PER_MIN ? 'dead' : castsPerMinute < RARE_PER_MIN ? 'rare' : rows.length > 1 && castShare > OVERUSED_SHARE ? 'overused' : 'ok';
    return {
      ...r, castsPerMinute, uptime: r.ticks === 0 ? 0 : r.activeTicks / r.ticks, hitsPerCast: r.casts === 0 ? 0 : r.hits / r.casts, castShare, verdict,
    };
  });
}

const CHARACTER_IDS: readonly string[] = CHARACTERS.map((c) => c.id);

export function measure(ruleset: UsageRuleset, seeds: number, seed: number, aiLevel: number): Map<string, SlotUsage[]> {
  const out = emptyUsage();
  const arcade = ruleset === 'arcade';
  const maxTicks = arcade ? ARCADE_MAX_TICKS : DEFAULT_MAX_TICKS;
  RACES.forEach((a, i) => {
    for (const b of RACES.slice(i + 1)) {
      for (let k = 0; k < seeds; k++) {
        const xp = xpForLevel(arcade ? 1 : 5);
        const aFirst = k % 2 === 0;
        const rosterA = [{ character: characterId(a), xp }];
        const rosterB = [{ character: characterId(b), xp }];
        const world = createMatch({
          simVersion: SIM_VERSION, seed: seed + k, flags: arcade ? { ...DEFAULT_SIM_FLAGS, rulesetArcade: true } : DEFAULT_SIM_FLAGS,
          chapter: 1, difficulty: 1, p1: aFirst ? rosterA : rosterB, p2: aFirst ? rosterB : rosterA,
        });
        const s = world.state;
        const agentA = makeTeamAgent('scripted', [a], b, aFirst ? 0 : 1, aiLevel);
        const agentB = makeTeamAgent('scripted', [b], a, aFirst ? 1 : 0, aiLevel);
        const agents: [typeof agentA, typeof agentA] = aFirst ? [agentA, agentB] : [agentB, agentA];
        const fighters: { id: number; rows: SlotUsage[]; last: number[] }[] = [];
        for (let id = 0; id < MAX_ENTITIES; id++) {
          // Kind 0 is the character kind, so free slots read as characters too: require the alive flag.
          if (s.kind[id] !== EntityKind.character || ((s.flags[id] ?? 0) & EntityFlag.alive) === 0) continue;
          const rows = out.get(CHARACTER_IDS[s.defId[id] ?? 0] ?? '');
          if (rows === undefined) continue;
          rows.forEach((r) => r.matches++);
          fighters.push({ id, rows, last: rows.map((_, slot) => s.abil[cooldownIdx(id, slot)] ?? 0) });
        }
        for (let t = 0; t < maxTicks; t++) {
          const events = step(world, collectCommands(world, agents));
          let over = false;
          for (const e of events) {
            if (e.kind === SimEventKind.matchEnded) over = true;
            if (e.kind !== SimEventKind.hitConfirmed) continue;
            const f = fighters.find((x) => x.id === e['attacker']);
            const slot = f?.rows.findIndex((r) => ABILITY_DEFS.findIndex((d) => d.id === r.ability) === e['ability']) ?? -1;
            const row = f?.rows[slot];
            if (row !== undefined) {
              row.hits++;
              row.damage += e['amount'] ?? 0;
            }
          }
          for (const f of fighters) {
            f.rows.forEach((row, slot) => {
              const cd = s.abil[cooldownIdx(f.id, slot)] ?? 0;
              if (cd > (f.last[slot] ?? 0)) row.casts++;
              f.last[slot] = cd;
              row.ticks++;
              const buff = BUFF_STATUS[row.ability];
              if ((s.abil[countIdx(f.id, slot)] ?? 0) > 0 || (buff !== undefined && hasStatus(s.status, f.id, buff))) row.activeTicks++;
            });
          }
          if (over) break;
        }
      }
    }
  });
  return out;
}

export function report(res: Map<string, SlotUsage[]>): { rows: UsageRow[]; dead: UsageRow[]; overused: UsageRow[] } {
  const rows = [...res.values()].flatMap((r) => judge(r));
  return { rows, dead: rows.filter((r) => r.verdict === 'dead'), overused: rows.filter((r) => r.verdict === 'overused') };
}

function main(): void {
  const { values } = parseArgs({ options: { ruleset: { type: 'string' }, seeds: { type: 'string' }, seed: { type: 'string' }, 'ai-level': { type: 'string' }, out: { type: 'string' } } });
  const ruleset: UsageRuleset = values.ruleset === 'classic' ? 'classic' : 'arcade';
  const seeds = Number(values.seeds ?? 4);
  const res = measure(ruleset, seeds, Number(values.seed ?? 1), Number(values['ai-level'] ?? 3));
  const { rows, dead, overused } = report(res);
  console.log(`Ability usage (${ruleset}, ${String(seeds)} seeds x 66 pairings, scripted AI). casts/min = rises of the cooldown deadline per fighter-minute.`);
  console.log('race            slot ability            kind    casts  /min  uptime  hits  hit/cast  dmg    share  verdict');
  for (const r of rows) {
    console.log(`${r.race.padEnd(15)} ${String(r.slot)}    ${r.ability.padEnd(18)} ${r.kind.padEnd(7)} ${String(r.casts).padStart(5)} ${r.castsPerMinute.toFixed(1).padStart(5)} ${(r.uptime * 100).toFixed(0).padStart(5)}% ${String(r.hits).padStart(5)} ${r.hitsPerCast.toFixed(2).padStart(8)} ${String(Math.round(r.damage)).padStart(6)} ${(r.castShare * 100).toFixed(0).padStart(4)}%  ${r.verdict}`);
  }
  console.log(`\nDead: ${dead.map((r) => `${r.race}/${r.ability}`).join(', ') || 'none'}`);
  console.log(`Overused: ${overused.map((r) => `${r.race}/${r.ability}`).join(', ') || 'none'}`);
  const path = values.out ?? 'out/ability-usage.json';
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify({ ruleset, seeds, rows, dead: dead.map((r) => `${r.race}/${r.ability}`), overused: overused.map((r) => `${r.race}/${r.ability}`) }, null, 2));
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) main();
