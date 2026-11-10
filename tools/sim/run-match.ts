// Headless AI-vs-AI match runner (`pnpm sim:match`). Node only: no Phaser, no DOM.
// Single pairing:  pnpm sim:match --a fiara --b curomo --agents scripted,random --seeds 20 --level 5 [--json]
// Round robin:     pnpm sim:match --tournament --seeds 4 [--agents scripted,scripted] [--json]
// Every seed is played with the sides swapped on odd seeds (team 0 carries the difficulty handicap), so side bias cancels.
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { type Agent, collectCommands } from '../../src/core/agents/agent';
import { RandomBot } from '../../src/core/agents/random-bot';
import { type AttackAbility, AttackAgent } from '../../src/core/agents/scripted-ai/attack';
import { CHARACTERS, getCharacter } from '../../src/core/data/characters';
import { ELEMENTS, type Element } from '../../src/core/data/elements';
import { characterId } from '../../src/core/data/ids';
import type { AbilityDef } from '../../src/core/data/types';
import { DEFAULT_SIM_FLAGS } from '../../src/core/flags';
import { SIM_VERSION } from '../../src/core/index';
import { fnv1a, splitmix32 } from '../../src/core/rng/seed';
import { Cmd, type Command } from '../../src/core/sim/commands';
import { SimEventKind } from '../../src/core/sim/events';
import { createMatch, type MatchSetup } from '../../src/core/sim/match';
import { EntityFlag, EntityKind, MAX_ENTITIES } from '../../src/core/sim/state';
import { step } from '../../src/core/sim/step';
import { ABILITY_DEFS } from '../../src/core/sim/systems/projectile';

/** The 12 playable races (the dummy target and the Eternal Void boss are excluded). */
export const RACES: readonly string[] = CHARACTERS.filter((c) => c.element !== 'void').map((c) => c.id);
/** Elements of the 12 races, in the order of the matrix rows and columns. */
export const MATRIX_ELEMENTS: readonly Element[] = ELEMENTS.filter((e) => e !== 'void');

export type AgentKind = 'scripted' | 'random';
export type EndReason = 'ko' | 'timeout' | 'stalemate';

/** Damage the projectile events cannot attribute (melee hits, damage over time): approximate, from per-tick HP drops. */
export const UNATTRIBUTED = 'melee-or-status';

export const DEFAULT_MAX_TICKS = 9000; // 3 minutes
export const DEFAULT_STALEMATE_TICKS = 1500; // 30 s without any HP change

/** Smallest XP that gives `level` (inverse of levelFromXp). */
export function xpForLevel(level: number): number {
  if (level < 5) return level;
  if (level < 10) return 5 + (level - 5) * 3;
  if (level < 15) return 20 + (level - 10) * 6;
  return 50 + (level - 15) * 10;
}

/** Deterministic per-match seed from the base seed and the match index. */
export function matchSeed(base: number, index: number): number {
  return splitmix32(fnv1a(`${String(base)}:${String(index)}`))();
}

// ---------------------------------------------------------------------------------------------
// Agents
// ---------------------------------------------------------------------------------------------

const EXPLOSION = new Set(['ground-shock', 'hurricane']);
const FACING: readonly Command[] = [Cmd.up, Cmd.right, Cmd.down, Cmd.left];
const DIR_MASK = Cmd.up | Cmd.down | Cmd.left | Cmd.right;

function defOf(id: string | undefined): AbilityDef | undefined {
  return ABILITY_DEFS.find((d) => d.id === id);
}

function toAttack(def: AbilityDef | undefined): AttackAbility {
  const maxActive = def?.maxActive ?? 1;
  switch (def?.kind) {
    case 'range':
    case 'debuff':
      return { type: 'range', maxActive };
    case 'melee':
      return {
        type: 'melee',
        w: def.w ?? 0,
        h: def.h ?? 0,
        reach: EXPLOSION.has(def.id) ? 'explosion' : 'directional',
        maxActive,
      };
    case 'heal':
      return { type: 'heal', maxActive };
    default:
      return { type: 'other', maxActive };
  }
}

/**
 * Scripted opponent: the legacy attack decisions (AttackAgent) plus what the legacy movement port will later own:
 * melee races close the distance, passive primaries (buff, heal) are used when ready, and shots carry a direction.
 */
export class ScriptedAI implements Agent {
  readonly id: string;
  private readonly attack: AttackAgent;
  private readonly passivePrimary: boolean;
  private readonly healPrimary: boolean;
  private readonly chaseReach: number;

  constructor(race: string, id = 'scripted') {
    this.id = id;
    const abilities = getCharacter(characterId(race)).abilities.map((a) => defOf(a));
    const [primary, secondary] = abilities.map(toAttack);
    this.attack = new AttackAgent(
      { primary: primary ?? { type: 'other', maxActive: 1 }, ...(secondary === undefined ? {} : { secondary }) },
      { id },
    );
    this.passivePrimary = primary?.type === 'other' || primary?.type === 'heal';
    this.healPrimary = primary?.type === 'heal';
    const reaches = abilities
      .filter((d) => d?.kind === 'melee')
      .map((d) => (EXPLOSION.has(d?.id ?? '') ? 0.5 : 1) * Math.max(d?.w ?? 0, d?.h ?? 0));
    this.chaseReach = reaches.length === 0 ? 0 : 0.8 * Math.min(...reaches);
  }

  observe(view: Parameters<Agent['observe']>[0]): Command {
    let cmd = this.attack.observe(view);
    const self = view.self;
    const opp = view.opponent;
    if (self === undefined || opp === undefined || (self.flags & EntityFlag.frozen) !== 0) return cmd;
    if (this.passivePrimary && (view.cooldowns[0] ?? 0) === 0 && (!this.healPrimary || self.hp < self.maxHp)) {
      cmd |= Cmd.primary;
    }
    if (this.chaseReach > 0 && Math.abs(opp.x - self.x) > this.chaseReach) {
      cmd |= opp.x > self.x ? Cmd.right : Cmd.left;
    } else if ((cmd & (Cmd.primary | Cmd.secondary)) !== 0 && (cmd & DIR_MASK) === 0) {
      cmd |= FACING[['n', 'e', 's', 'w'].indexOf(this.attack.direction)] ?? 0;
    }
    return cmd;
  }
}

export function makeAgent(kind: AgentKind, race: string): Agent {
  return kind === 'random' ? new RandomBot(`random:${race}`) : new ScriptedAI(race, `scripted:${race}`);
}

// ---------------------------------------------------------------------------------------------
// One match
// ---------------------------------------------------------------------------------------------

export interface MatchOptions {
  readonly raceA: string;
  readonly raceB: string;
  readonly agentA: AgentKind;
  readonly agentB: AgentKind;
  readonly seed: number;
  readonly level: number;
  readonly difficulty: number;
  /** Side A plays team 0 (the player side) when true, team 1 otherwise. */
  readonly aIsTeam0: boolean;
  readonly maxTicks?: number;
  readonly stalemateTicks?: number;
}

export interface MatchResult {
  readonly seed: number;
  readonly aIsTeam0: boolean;
  readonly winner: 'a' | 'b' | 'draw';
  readonly endReason: EndReason;
  readonly ticks: number;
  /** Damage dealt per ability id (both sides pooled), plus the approximate UNATTRIBUTED bucket. */
  readonly damageByAbility: Readonly<Record<string, number>>;
  readonly damageBySide: { readonly a: number; readonly b: number };
}

function teamHp(world: ReturnType<typeof createMatch>, team: number): number {
  const s = world.state;
  let sum = 0;
  for (let id = 0; id < MAX_ENTITIES; id++) {
    if (s.kind[id] === EntityKind.character && s.team[id] === team) sum += Math.max(0, s.hp[id] ?? 0);
  }
  return sum;
}

const r3 = (n: number): number => Math.round(n * 1000) / 1000;

export function runMatch(o: MatchOptions): MatchResult {
  const maxTicks = o.maxTicks ?? DEFAULT_MAX_TICKS;
  const stalemateTicks = o.stalemateTicks ?? DEFAULT_STALEMATE_TICKS;
  const xp = xpForLevel(o.level);
  const rosterA = [{ character: characterId(o.raceA), xp }];
  const rosterB = [{ character: characterId(o.raceB), xp }];
  const setup: MatchSetup = {
    simVersion: SIM_VERSION,
    seed: o.seed,
    flags: DEFAULT_SIM_FLAGS,
    chapter: 1,
    difficulty: o.difficulty,
    p1: o.aIsTeam0 ? rosterA : rosterB,
    p2: o.aIsTeam0 ? rosterB : rosterA,
  };
  const world = createMatch(setup);
  const s = world.state;
  const teamA = o.aIsTeam0 ? 0 : 1;
  const agentA = makeAgent(o.agentA, o.raceA);
  const agentB = makeAgent(o.agentB, o.raceB);
  const agents: [Agent, Agent] = o.aIsTeam0 ? [agentA, agentB] : [agentB, agentA];

  const projectileAbility = new Int32Array(MAX_ENTITIES);
  const byAbility: Record<string, number> = {};
  const bySide = { a: 0, b: 0 };
  let winnerTeam: number | undefined;
  let endReason: EndReason = 'timeout';
  let hp = [teamHp(world, 0), teamHp(world, 1)];
  let lastChange = 0;
  let ticks = 0;

  for (; ticks < maxTicks; ) {
    // A projectile that hits is freed (and its fields cleared) inside the step, so note what each one is first.
    for (let id = 0; id < MAX_ENTITIES; id++) {
      projectileAbility[id] = s.kind[id] === EntityKind.projectile ? (s.defId[id] ?? 0) : -1;
    }
    const events = step(world, collectCommands(world, agents));
    ticks++;
    const evented = [0, 0];
    for (const e of events) {
      if (e.kind === SimEventKind.damage) {
        const name = ABILITY_DEFS[projectileAbility[e.sourceId] ?? -1]?.id ?? 'unknown';
        const amount = e['amount'] ?? 0;
        byAbility[name] = (byAbility[name] ?? 0) + amount;
        const victim = s.team[e['target'] ?? 0] ?? 0;
        evented[victim] = (evented[victim] ?? 0) + amount;
        bySide[victim === teamA ? 'b' : 'a'] += amount;
      } else if (e.kind === SimEventKind.matchEnded) {
        winnerTeam = e['winner'];
      }
    }
    const now = [teamHp(world, 0), teamHp(world, 1)];
    for (const t of [0, 1]) {
      const drop = (hp[t] ?? 0) - (now[t] ?? 0) - (evented[t] ?? 0);
      if (drop > 1e-9) {
        byAbility[UNATTRIBUTED] = (byAbility[UNATTRIBUTED] ?? 0) + drop;
        bySide[t === teamA ? 'b' : 'a'] += drop;
      }
    }
    if (now[0] !== hp[0] || now[1] !== hp[1]) lastChange = ticks;
    hp = now;
    if (winnerTeam !== undefined) {
      endReason = 'ko';
      break;
    }
    if (ticks - lastChange >= stalemateTicks) {
      endReason = 'stalemate';
      break;
    }
  }

  const winner = winnerTeam === undefined || winnerTeam < 0 ? 'draw' : winnerTeam === teamA ? 'a' : 'b';
  const damageByAbility = Object.fromEntries(Object.entries(byAbility).map(([k, v]) => [k, r3(v)]));
  return {
    seed: o.seed,
    aIsTeam0: o.aIsTeam0,
    winner,
    endReason,
    ticks,
    damageByAbility,
    damageBySide: { a: r3(bySide.a), b: r3(bySide.b) },
  };
}

// ---------------------------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------------------------

/** Wilson 95% score interval for `successes` of `n`. */
export function wilson95(successes: number, n: number): [number, number] {
  if (n === 0) return [0, 1];
  const z = 1.96;
  const p = successes / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return [Math.max(0, centre - half), Math.min(1, centre + half)];
}

export interface PairingSummary {
  readonly a: string;
  readonly b: string;
  readonly agents: readonly [AgentKind, AgentKind];
  readonly matches: number;
  readonly winsA: number;
  readonly winsB: number;
  readonly draws: number;
  /** Draws count half. */
  readonly winRateA: number;
  readonly winRateCI95: readonly [number, number];
  readonly meanTicks: number;
  readonly endReasons: Readonly<Record<EndReason, number>>;
  readonly stalemateRate: number;
  readonly damageByAbility: Readonly<Record<string, number>>;
  /** Share of all damage dealt, per ability id. */
  readonly damageShare: Readonly<Record<string, number>>;
}

export function summarize(
  a: string,
  b: string,
  agents: readonly [AgentKind, AgentKind],
  results: readonly MatchResult[],
): PairingSummary {
  const n = results.length;
  const winsA = results.filter((r) => r.winner === 'a').length;
  const winsB = results.filter((r) => r.winner === 'b').length;
  const draws = n - winsA - winsB;
  const score = winsA + draws / 2;
  const endReasons: Record<EndReason, number> = { ko: 0, timeout: 0, stalemate: 0 };
  const dmg: Record<string, number> = {};
  for (const r of results) {
    endReasons[r.endReason]++;
    for (const [k, v] of Object.entries(r.damageByAbility)) dmg[k] = (dmg[k] ?? 0) + v;
  }
  const total = Object.values(dmg).reduce((x, y) => x + y, 0);
  const [lo, hi] = wilson95(score, n);
  return {
    a,
    b,
    agents,
    matches: n,
    winsA,
    winsB,
    draws,
    winRateA: n === 0 ? 0 : r3(score / n),
    winRateCI95: [r3(lo), r3(hi)],
    meanTicks: n === 0 ? 0 : r3(results.reduce((x, r) => x + r.ticks, 0) / n),
    endReasons,
    stalemateRate: n === 0 ? 0 : r3(endReasons.stalemate / n),
    damageByAbility: Object.fromEntries(Object.entries(dmg).map(([k, v]) => [k, r3(v)])),
    damageShare: Object.fromEntries(Object.entries(dmg).map(([k, v]) => [k, total === 0 ? 0 : r3(v / total)])),
  };
}

export interface PairingOptions {
  readonly a: string;
  readonly b: string;
  readonly agents: readonly [AgentKind, AgentKind];
  readonly seeds: number;
  readonly seed: number;
  readonly level: number;
  readonly difficulty: number;
  readonly maxTicks?: number;
  readonly stalemateTicks?: number;
}

export function runPairing(o: PairingOptions): { summary: PairingSummary; results: MatchResult[] } {
  const results: MatchResult[] = [];
  for (let i = 0; i < o.seeds; i++) {
    results.push(
      runMatch({
        raceA: o.a,
        raceB: o.b,
        agentA: o.agents[0],
        agentB: o.agents[1],
        seed: matchSeed(o.seed, i),
        level: o.level,
        difficulty: o.difficulty,
        aIsTeam0: i % 2 === 0,
        ...(o.maxTicks === undefined ? {} : { maxTicks: o.maxTicks }),
        ...(o.stalemateTicks === undefined ? {} : { stalemateTicks: o.stalemateTicks }),
      }),
    );
  }
  return { summary: summarize(o.a, o.b, o.agents, results), results };
}

// ---------------------------------------------------------------------------------------------
// Tournament
// ---------------------------------------------------------------------------------------------

export interface MatrixCell {
  readonly games: number;
  /** Score of the row element against the column element (draws count half). */
  readonly winRate: number;
}

export interface TournamentSummary {
  readonly races: readonly string[];
  readonly seedsPerPairing: number;
  readonly matches: number;
  readonly ranking: readonly {
    readonly race: string;
    readonly element: Element;
    readonly games: number;
    readonly score: number;
    readonly winRate: number;
  }[];
  readonly pairs: readonly PairingSummary[];
  readonly matrix: { readonly elements: readonly Element[]; readonly cells: readonly (readonly MatrixCell[])[] };
}

export function runTournament(
  o: Omit<PairingOptions, 'a' | 'b'>,
  races: readonly string[] = RACES,
): TournamentSummary {
  const pairs: PairingSummary[] = [];
  for (let i = 0; i < races.length; i++) {
    for (let j = i + 1; j < races.length; j++) {
      pairs.push(runPairing({ ...o, a: races[i] ?? '', b: races[j] ?? '' }).summary);
    }
  }
  const score = new Map<string, { games: number; score: number }>(races.map((r) => [r, { games: 0, score: 0 }]));
  const els = MATRIX_ELEMENTS;
  const acc = els.map(() => els.map(() => ({ games: 0, score: 0 })));
  const elementOf = (r: string): Element => getCharacter(characterId(r)).element;
  for (const p of pairs) {
    const sa = p.winsA + p.draws / 2;
    const sb = p.winsB + p.draws / 2;
    for (const [race, sc] of [[p.a, sa], [p.b, sb]] as const) {
      const row = score.get(race);
      if (row) {
        row.games += p.matches;
        row.score += sc;
      }
    }
    const ea = els.indexOf(elementOf(p.a));
    const eb = els.indexOf(elementOf(p.b));
    const ab = acc[ea]?.[eb];
    const ba = acc[eb]?.[ea];
    if (ab) {
      ab.games += p.matches;
      ab.score += sa;
    }
    if (ba) {
      ba.games += p.matches;
      ba.score += sb;
    }
  }
  const ranking = races
    .map((race) => {
      const row = score.get(race) ?? { games: 0, score: 0 };
      return {
        race,
        element: elementOf(race),
        games: row.games,
        score: row.score,
        winRate: row.games === 0 ? 0 : r3(row.score / row.games),
      };
    })
    .sort((x, y) => y.winRate - x.winRate || x.race.localeCompare(y.race));
  return {
    races,
    seedsPerPairing: o.seeds,
    matches: pairs.reduce((n, p) => n + p.matches, 0),
    ranking,
    pairs,
    matrix: {
      elements: els,
      cells: acc.map((row) => row.map((c) => ({ games: c.games, winRate: c.games === 0 ? 0 : r3(c.score / c.games) }))),
    },
  };
}

// ---------------------------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------------------------

function pct(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}

export function formatPairing(p: PairingSummary): string {
  const lines = [
    `${p.a} (${p.agents[0]}) vs ${p.b} (${p.agents[1]}): ${String(p.matches)} matches`,
    `  ${p.a} wins ${String(p.winsA)}, ${p.b} wins ${String(p.winsB)}, draws ${String(p.draws)}`,
    `  ${p.a} win rate ${pct(p.winRateA)} (Wilson 95% CI ${pct(p.winRateCI95[0])} to ${pct(p.winRateCI95[1])})`,
    `  mean ticks ${p.meanTicks.toFixed(0)}; ko ${String(p.endReasons.ko)}, timeout ${String(p.endReasons.timeout)}, stalemate ${String(p.endReasons.stalemate)}`,
    '  damage share:',
    ...Object.entries(p.damageShare)
      .sort((x, y) => y[1] - x[1])
      .map(([k, v]) => `    ${k.padEnd(22)}${pct(v).padStart(7)}`),
  ];
  return lines.join('\n');
}

export function formatTournament(t: TournamentSummary): string {
  const w = 8;
  const head = ['row vs col'.padEnd(12), ...t.matrix.elements.map((e) => e.padStart(w))].join('');
  const rows = t.matrix.elements.map((e, i) =>
    [e.padEnd(12), ...(t.matrix.cells[i] ?? []).map((c) => pct(c.winRate).padStart(w))].join(''),
  );
  const rank = t.ranking.map(
    (r, i) => `${String(i + 1).padStart(3)}. ${r.race.padEnd(12)}${r.element.padEnd(7)}${pct(r.winRate).padStart(7)}`,
  );
  return [
    `Tournament: ${String(t.races.length)} races, ${String(t.seedsPerPairing)} seeds per pairing, ${String(t.matches)} matches`,
    '',
    'Element matchup matrix (win rate of the row element):',
    head,
    ...rows,
    '',
    'Race ranking:',
    ...rank,
  ].join('\n');
}

function parseAgents(v: string | undefined): readonly [AgentKind, AgentKind] {
  const parts = (v ?? 'scripted,scripted').split(',');
  const ok = (x: string | undefined): x is AgentKind => x === 'scripted' || x === 'random';
  const [x, y = x] = parts;
  if (!ok(x) || !ok(y) || parts.length > 2) throw new Error(`--agents must be scripted|random[,scripted|random], got "${v ?? ''}"`);
  return [x, y];
}

function num(v: string | undefined, def: number, name: string): number {
  if (v === undefined) return def;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`--${name} must be a number, got "${v}"`);
  return n;
}

export function main(argv: readonly string[]): number {
  try {
    const { values } = parseArgs({
      args: [...argv],
      options: {
        a: { type: 'string' },
        b: { type: 'string' },
        agents: { type: 'string' },
        seeds: { type: 'string' },
        seed: { type: 'string' },
        level: { type: 'string' },
        difficulty: { type: 'string' },
        'max-ticks': { type: 'string' },
        'stalemate-ticks': { type: 'string' },
        tournament: { type: 'boolean' },
        json: { type: 'boolean' },
      },
    });
    const base = {
      agents: parseAgents(values.agents),
      seeds: num(values.seeds, values.tournament === true ? 2 : 10, 'seeds'),
      seed: num(values.seed, 1, 'seed'),
      level: num(values.level, 1, 'level'),
      difficulty: num(values.difficulty, 1, 'difficulty'),
      maxTicks: num(values['max-ticks'], DEFAULT_MAX_TICKS, 'max-ticks'),
      stalemateTicks: num(values['stalemate-ticks'], DEFAULT_STALEMATE_TICKS, 'stalemate-ticks'),
    };
    if (values.tournament === true) {
      const t = runTournament(base);
      console.log(values.json === true ? JSON.stringify(t, null, 2) : formatTournament(t));
      return 0;
    }
    for (const race of [values.a, values.b]) {
      if (race === undefined || !RACES.includes(race)) throw new Error(`--a and --b must each be one of: ${RACES.join(', ')}`);
    }
    const { summary } = runPairing({ ...base, a: values.a ?? '', b: values.b ?? '' });
    console.log(values.json === true ? JSON.stringify(summary, null, 2) : formatPairing(summary));
    return 0;
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    console.error('usage: pnpm sim:match --a <race> --b <race> [--agents scripted,random] [--seeds N] [--seed S] [--level L] [--difficulty D] [--json]');
    console.error('       pnpm sim:match --tournament [--seeds N] [--agents ...] [--json]');
    return 2;
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}
