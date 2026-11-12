// Headless AI-vs-AI match runner (`pnpm sim:match`). Node only: no Phaser, no DOM.
// Single pairing:  pnpm sim:match --a fiara --b curomo --agents scripted,random --seeds 20 --level 5 [--json]
// --no-traps (Arcade): masks the Trap command bit from every agent; trap hits show as trap-bomb / trap-spike in damageByAbility.
// Round robin:     pnpm sim:match --tournament --seeds 4 [--agents scripted,scripted] [--json]
// Every seed is played with the sides swapped on odd seeds (team 0 carries the difficulty handicap), so side bias cancels.
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { type Agent, type AgentState, type FighterView, collectCommands, stateRecord } from '../../src/core/agents/agent';
import { RandomBot } from '../../src/core/agents/random-bot';
import { ArcadeTactics } from '../../src/core/agents/scripted-ai/arcade';
import { ArcadeTactics as ArcadeTacticsV1 } from './arcade-ai-v1/arcade';
import { AI_EASY, AI_HARD, AI_NORMAL, type ArcadeAiLevel, type Style } from '../../src/core/agents/scripted-ai/arcade-ai';
import { type AttackAbility, AttackAgent } from '../../src/core/agents/scripted-ai/attack';
import { arcadePlayfield } from '../../src/core/data/arcade';
import { CHARACTERS, getCharacter } from '../../src/core/data/characters';
import { ELEMENTS, type Element, elementRelation } from '../../src/core/data/elements';
import { characterId } from '../../src/core/data/ids';
import type { AbilityDef } from '../../src/core/data/types';
import { DEFAULT_SIM_FLAGS, assertNoTesterFlags } from '../../src/core/flags';
import { SIM_VERSION } from '../../src/core/index';
import { fnv1a, splitmix32 } from '../../src/core/rng/seed';
import { Cmd, type Command, NO_COMMAND } from '../../src/core/sim/commands';
import { type SimEvent, SimEventKind } from '../../src/core/sim/events';
import { createMatch, type MatchSetup } from '../../src/core/sim/match';
import { EntityFlag, EntityKind, MAX_ENTITIES } from '../../src/core/sim/state';
import { step } from '../../src/core/sim/step';
import { DEFAULT_ARENA } from '../../src/core/sim/world';
import { RANGED } from '../../src/core/sim/systems/arcade/meter';
import { CHARGE_DEF, SUPER_DEF, TRAP_BOMB_DEF, TRAP_SPIKE_DEF } from '../../src/core/sim/systems/arcade/hit';
import { ABILITY_DEFS } from '../../src/core/sim/systems/projectile';
import { type FunMetrics, reduceFunMetrics } from './fun-metrics';

/** The 12 playable races (the dummy target and the Eternal Void boss are excluded). */
export const RACES: readonly string[] = CHARACTERS.filter((c) => c.element !== 'void').map((c) => c.id);
/** Elements of the 12 races, in the order of the matrix rows and columns. */
export const MATRIX_ELEMENTS: readonly Element[] = ELEMENTS.filter((e) => e !== 'void');

export type AgentKind = 'scripted' | 'random';
export type EndReason = 'ko' | 'timeout' | 'stalemate';
export type Ruleset = 'classic' | 'arcade';

/** Damage the projectile events cannot attribute (melee hits, damage over time): approximate, from per-tick HP drops. */
export const UNATTRIBUTED = 'melee-or-status';
/** Damage source name of Arcade super hits (`hitConfirmed.ability === SUPER_DEF`, outside ABILITY_DEFS). */
export const SUPER_SOURCE = 'super';
/** Damage source name of Arcade charge arrival hits (`ability === CHARGE_DEF`). */
export const CHARGE_SOURCE = 'charge';
/** Damage source names of Arcade trap hits (`ability === TRAP_BOMB_DEF` / `TRAP_SPIKE_DEF`, outside ABILITY_DEFS). */
export const TRAP_BOMB_SOURCE = 'trap-bomb';
export const TRAP_SPIKE_SOURCE = 'trap-spike';

/** `--no-traps`: the agent with the Trap command bit (Cmd.trap) cleared from every command it issues. */
export function withoutTraps(agent: Agent): Agent {
  return { id: agent.id, observe: (v, t) => agent.observe(v, t) & ~Cmd.trap, save: () => agent.save(), load: (x) => agent.load(x) };
}

export const DEFAULT_MAX_TICKS = 9000; // 3 minutes
/**
 * Arcade's tooling cap: a best of 3 always ends by itself (each round has a 4500-game-tick timer), but three long rounds
 * plus their intros, KO phases and hit-stop freezes outlast 9000 ticks, so Arcade matches get 6 minutes.
 */
export const ARCADE_MAX_TICKS = 18000;
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

/** Pixel distance inside which an aligned opponent can hurt us (bullets cover ~8 px per tick). */
const THREAT_DX = 560;
const OMNI_DX = 400;
const HEAL_BELOW = 0.6;
/** Vertical offset (px) that keeps a melee chaser clear of bullets and the shooter's alignment test. */
const OFFSET_DY = 52;
const OFFSET_SLACK = 6;
/** Horizontal distance (px) under which the legacy melee range test passes (it compares dx with half a body), and where the dash starts. */
const MELEE_DX = 36;
const DASH_DX = 160;

/** Slots the scripted agent drives itself (self-cast kinds); the legacy-port AttackAgent only handles range, debuff and melee. */
function isSelfCast(def: AbilityDef | undefined): boolean {
  return def?.kind === 'buff' || def?.kind === 'heal' || def?.kind === 'omni';
}

/**
 * Whether a self-cast ability is worth using right now. Defensive buffs (armour, adrenaline, translucency) wait until the
 * opponent is lined up and close enough to hit us, so their short windows are not wasted; Fire Dance (speed) is used on
 * cooldown; heals below 60% health; omni fans when the opponent is within their reach.
 */
function wantsSelfCast(def: AbilityDef, self: { x: number; y: number; hp: number; maxHp: number }, opp: { x: number; y: number; h: number }): boolean {
  const dx = Math.abs(opp.x - self.x);
  const aligned = Math.abs(opp.y - self.y) <= opp.h / 2 || dx <= opp.h / 2;
  switch (def.kind) {
    case 'heal':
      return self.hp <= self.maxHp * HEAL_BELOW;
    case 'omni':
      return dx < OMNI_DX && aligned;
    case 'buff':
      return def.id === 'fire-dance' || (aligned && dx < THREAT_DX);
    default:
      return false;
  }
}

/**
 * Scripted opponent: the legacy attack decisions (AttackAgent) plus what the legacy movement port will later own:
 * melee races close the distance, shots carry a direction, and every slot is used: range, debuff and melee through the
 * AttackAgent, buffs, heals and omni fans through `wantsSelfCast`. In Arcade the core `ArcadeTactics` layer (defence,
 * spacing, combos, supers, weather; its level from `--ai-level`, its personality drawn per match unless given) edits the
 * result; in Classic it returns the command unchanged and draws nothing.
 */
export class ScriptedAI implements Agent {
  readonly id: string;
  private readonly attack: AttackAgent;
  private readonly defs: readonly (AbilityDef | undefined)[];
  private readonly melee: boolean;
  private readonly arcade: ArcadeTactics | ArcadeTacticsV1;

  /** `opponent` (its race) decides the weather rule; `aiLevel` 1..5 and `personality` are the Arcade knobs. */
  constructor(race: string, id = 'scripted', opponent = race, aiLevel = 3, personality?: Style, frozenV1 = false) {
    this.id = id;
    const me = getCharacter(characterId(race));
    this.defs = me.abilities.slice(0, 2).map((a) => defOf(a));
    const [primary, secondary] = this.defs.map(toAttack);
    this.attack = new AttackAgent(
      { primary: primary ?? { type: 'other', maxActive: 1 }, ...(secondary === undefined ? {} : { secondary }) },
      { id },
    );
    this.melee = this.defs.some((d) => d?.kind === 'melee');
    const unfavourable = elementRelation(me.element, getCharacter(characterId(opponent)).element) === 'dis';
    this.arcade = frozenV1 ? new ArcadeTacticsV1(arcadeLevel(aiLevel), personality, unfavourable) : new ArcadeTactics(arcadeLevel(aiLevel), personality, unfavourable);
  }

  /**
   * Melee approach. KNOWN-BUG:melee-range-axes makes the legacy attack decision accept a melee only within MELEE_DX
   * horizontally, so a melee race has to close right in. Far away it stays just off the opponent's firing line (bullets
   * fly along the shooter's axis and the legacy decision only fires when the target is within half a body of it), then
   * steps in line for the last DASH_DX. In Arcade only (`arcade`), the off-line side flips when the wall leaves no room for
   * the offset there (a dash can end against a wall, where pressing into it would pin the chaser; Classic is unchanged).
   */
  private chase(self: FighterView, opp: FighterView, arcade: boolean): Command {
    const dx = Math.abs(opp.x - self.x);
    const dy = opp.y - self.y;
    let cmd: Command = dx <= MELEE_DX ? NO_COMMAND : opp.x > self.x ? Cmd.right : Cmd.left;
    if (dx > DASH_DX) {
      const a = arcade ? arcadePlayfield() : DEFAULT_ARENA;
      const room = dy > 0 ? self.y - OFFSET_DY > a.y : self.y + self.h + OFFSET_DY < a.y + a.h;
      if (Math.abs(dy) < OFFSET_DY) cmd |= dy > 0 === (room || !arcade) ? Cmd.up : Cmd.down;
      else if (Math.abs(dy) > OFFSET_DY + OFFSET_SLACK) cmd |= dy > 0 ? Cmd.down : Cmd.up;
    } else if (Math.abs(dy) > OFFSET_SLACK) {
      cmd |= dy > 0 ? Cmd.down : Cmd.up;
    }
    return cmd;
  }

  /** The attack facing and the Arcade layer (with its stream) are remembered; the movement here is a pure function of the view. */
  save(): AgentState {
    return { attack: this.attack.save(), arcade: this.arcade.save() };
  }

  load(state: AgentState): void {
    const rec = stateRecord(state, this.id);
    this.attack.load(rec['attack'] ?? null);
    this.arcade.load(rec['arcade'] ?? null);
  }

  observe(view: Parameters<Agent['observe']>[0]): Command {
    let cmd = this.attack.observe(view);
    const self = view.self;
    const opp = view.opponent;
    if (self === undefined || opp === undefined || (self.flags & EntityFlag.frozen) !== 0) return cmd;
    const slotBits = [Cmd.primary, Cmd.secondary] as const;
    let shooting = false;
    this.defs.forEach((def, slot) => {
      const bit = slotBits[slot] ?? 0;
      if (def !== undefined && isSelfCast(def)) {
        cmd &= ~bit;
        if ((view.cooldowns[slot] ?? 0) === 0 && wantsSelfCast(def, self, opp)) cmd |= bit;
      } else if ((cmd & bit) !== 0) {
        shooting = true;
      }
    });
    if (this.melee) cmd |= this.chase(self, opp, view.arcade !== undefined);
    if (shooting && (cmd & DIR_MASK) === 0) cmd |= FACING[['n', 'e', 's', 'w'].indexOf(this.attack.direction)] ?? 0;
    const slot = this.defs.findIndex((d, i) => (d?.kind === 'range' || d?.kind === 'debuff') && (view.cooldowns[i] ?? 0) === 0);
    return this.arcade.apply(view, cmd, slotBits[slot] ?? 0);
  }
}

/** `--ai-level` 1..5 (Easy, Casual, Normal, Hard, WTF) to an ArcadeAiLevel: Casual plays Easy and WTF plays Hard. */
export function arcadeLevel(aiLevel: number): ArcadeAiLevel {
  return aiLevel <= 2 ? AI_EASY : aiLevel === 3 ? AI_NORMAL : AI_HARD;
}

export function makeAgent(kind: AgentKind, race: string, opponent = race, aiLevel = 3, frozenV1 = false): Agent {
  return kind === 'random' ? new RandomBot(`random:${race}`) : new ScriptedAI(race, `scripted:${race}`, opponent, aiLevel, undefined, frozenV1);
}

/**
 * A team's agent for a multi-hero roster (`--team-size 2`, FUN-DESIGN 2.6): one agent per hero, built for that hero's
 * race, and the one whose hero is in play answers (entity ids follow roster order from `first`), so a tagged-in partner
 * is not played with the first hero's abilities. A tag drops the partner on the outgoing hero's spot, often off every
 * firing line, where the ranged bots (which only shoot along a shared axis and never walk to one) would stand idle for
 * good; so when its hero's agent sends nothing, the team bot steps onto the opponent's row. With one hero it is that
 * hero's agent itself (1v1 runs and baselines are unchanged).
 */
export function makeTeamAgent(kind: AgentKind, races: readonly string[], opponent: string, first: number, aiLevel = 3, frozenV1 = false): Agent {
  const heroes = races.map((r) => makeAgent(kind, r, opponent, aiLevel, frozenV1));
  const lead = heroes[0];
  if (lead === undefined) throw new RangeError('empty roster');
  if (heroes.length === 1) return lead;
  return {
    id: lead.id,
    observe: (view, tick) => {
      const cmd = (heroes[(view.self?.id ?? first) - first] ?? lead).observe(view, tick);
      const dy = (view.opponent?.y ?? 0) - (view.self?.y ?? 0);
      if (cmd !== NO_COMMAND || Math.abs(dy) <= (view.opponent?.h ?? 0) / 2) return cmd;
      return dy > 0 ? Cmd.down : Cmd.up;
    },
    save: () => heroes.map((h) => h.save()),
    load: (state) => {
      heroes.forEach((h, i) => {
        h.load(Array.isArray(state) ? ((state as readonly AgentState[])[i] ?? null) : null);
      });
    },
  };
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
  /** Default 'classic' (bit-identical to before the option existed). */
  readonly ruleset?: Ruleset;
  /** Heroes per side: 1, 2 or 3 (the lead plus partners further on in RACES). The scripted agent only plays the lead's kit. */
  readonly teamSize?: 1 | 2 | 3;
  /** Explicit roster of side B (boss probe, `tools/sim/boss-probe.ts`): replaces B's `teamSize` partners; side A is unchanged. */
  readonly rosterB?: readonly string[];
  /**
   * AI level 1..5 (default 3, Normal): the Arcade AI knobs (FUN-DESIGN 2.11, `arcadeLevel`). Classic ignores it.
   */
  readonly aiLevel?: number;
  /** Which side plays the frozen pre-smarter Arcade AI (tools/sim/arcade-ai-v1), for `ai:duel`; default neither. */
  readonly frozenV1?: 'a' | 'b';
  /** Mask the Trap command bit from both agents (`--no-traps`); only Arcade reads that bit as a trap. */
  readonly noTraps?: boolean;
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
  /** Fun metrics of the match; Arcade only. */
  readonly fun?: FunMetrics;
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
  const arcade = o.ruleset === 'arcade';
  // A 2v2 round runs to its timer more often (two life bars, bench recovery), so the cap grows with the team.
  const maxTicks = o.maxTicks ?? (arcade ? ARCADE_MAX_TICKS * (o.teamSize ?? 1) : DEFAULT_MAX_TICKS);
  const stalemateTicks = o.stalemateTicks ?? DEFAULT_STALEMATE_TICKS;
  const xp = xpForLevel(o.level);
  // A 2v2 partner is the race half the list on: the pairings play neighbours (a against a + 1), so the partners never
  // repeat a race of the other side (a mirror of identical bots stands on one spot and its shots cancel forever).
  // 3v3 (WP-arcade-3v3): the two partners are a third and two thirds of the list on, on the same reasoning.
  const offsets = o.teamSize === 3 ? [RACES.length / 3, (2 * RACES.length) / 3] : o.teamSize === 2 ? [RACES.length / 2] : [];
  const roster = (race: string): { character: ReturnType<typeof characterId>; xp: number }[] =>
    [race, ...offsets.map((k) => RACES[(RACES.indexOf(race) + k) % RACES.length] ?? race)].map((r) => ({
      character: characterId(r),
      xp,
    }));
  const rosterA = roster(o.raceA);
  const rosterB = o.rosterB === undefined ? roster(o.raceB) : o.rosterB.map((r) => ({ character: characterId(r), xp }));
  const setup: MatchSetup = {
    simVersion: SIM_VERSION,
    seed: o.seed,
    flags: arcade ? { ...DEFAULT_SIM_FLAGS, rulesetArcade: true } : DEFAULT_SIM_FLAGS,
    chapter: 1,
    difficulty: arcade ? 1 : o.difficulty, // Arcade ignores difficulty for stats (FUN-DESIGN 2.11)
    p1: o.aIsTeam0 ? rosterA : rosterB,
    p2: o.aIsTeam0 ? rosterB : rosterA,
  };
  assertNoTesterFlags(setup.flags); // balance gates never run tester (cheat) matches
  const world = createMatch(setup);
  const s = world.state;
  const teamA = o.aIsTeam0 ? 0 : 1;
  const races = (r: { character: string }[]): string[] => r.map((m) => m.character);
  const agentA = makeTeamAgent(o.agentA, races(rosterA), o.raceB, o.aIsTeam0 ? 0 : rosterB.length, o.aiLevel, o.frozenV1 === 'a');
  const agentB = makeTeamAgent(o.agentB, races(rosterB), o.raceA, o.aIsTeam0 ? rosterA.length : 0, o.aiLevel, o.frozenV1 === 'b');
  const pair: [Agent, Agent] = o.aIsTeam0 ? [agentA, agentB] : [agentB, agentA];
  const agents: [Agent, Agent] = o.noTraps === true && arcade ? [withoutTraps(pair[0]), withoutTraps(pair[1])] : pair;

  const projectileAbility = new Int32Array(MAX_ENTITIES);
  const byAbility: Record<string, number> = {};
  const bySide = { a: 0, b: 0 };
  let winnerTeam: number | undefined;
  let endReason: EndReason = 'timeout';
  let hp = [teamHp(world, 0), teamHp(world, 1)];
  let lastChange = 0;
  let ticks = 0;
  const log: SimEvent[] = [];

  for (; ticks < maxTicks; ) {
    // A projectile that hits is freed (and its fields cleared) inside the step, so note what each one is first.
    for (let id = 0; id < MAX_ENTITIES; id++) {
      projectileAbility[id] = s.kind[id] === EntityKind.projectile ? (s.defId[id] ?? 0) : -1;
    }
    const events = step(world, collectCommands(world, agents));
    ticks++;
    const evented = [0, 0];
    for (const e of events) {
      if (arcade) log.push(e);
      if (arcade && e.kind === SimEventKind.hitConfirmed) {
        // Arcade names the ability on every hit (melee included), so nothing is approximated for hits.
        const name = e['ability'] === SUPER_DEF ? SUPER_SOURCE : e['ability'] === CHARGE_DEF ? CHARGE_SOURCE : e['ability'] === TRAP_BOMB_DEF ? TRAP_BOMB_SOURCE : e['ability'] === TRAP_SPIKE_DEF ? TRAP_SPIKE_SOURCE : (ABILITY_DEFS[e['ability'] ?? -1]?.id ?? 'unknown');
        const amount = e['amount'] ?? 0;
        byAbility[name] = (byAbility[name] ?? 0) + amount;
        const victim = s.team[e['target'] ?? 0] ?? 0;
        evented[victim] = (evented[victim] ?? 0) + amount;
        bySide[victim === teamA ? 'b' : 'a'] += amount;
      } else if (arcade && e.kind === SimEventKind.damage) {
        continue; // counted through its hitConfirmed
      } else if (e.kind === SimEventKind.damage) {
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
    ...(arcade ? { fun: reduceFunMetrics(log, { ticks, endReason, teamOf: (id) => s.team[id] ?? 0, rangedOf: (id) => RANGED[s.defId[id] ?? 0] === 1 }) } : {}),
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
  readonly ruleset?: Ruleset;
  readonly teamSize?: 1 | 2 | 3;
  readonly aiLevel?: number;
  readonly noTraps?: boolean;
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
        ...(o.ruleset === undefined ? {} : { ruleset: o.ruleset }),
        ...(o.teamSize === undefined ? {} : { teamSize: o.teamSize }),
        ...(o.aiLevel === undefined ? {} : { aiLevel: o.aiLevel }),
        ...(o.noTraps === true ? { noTraps: true } : {}),
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

export function parseRuleOptions(
  ruleset: string | undefined,
  teamSize: string | undefined,
  aiLevel: string | undefined,
): { ruleset: Ruleset; teamSize: 1 | 2 | 3; aiLevel: number } {
  if (ruleset !== undefined && ruleset !== 'classic' && ruleset !== 'arcade') throw new Error(`--ruleset must be classic|arcade, got "${ruleset}"`);
  const size = num(teamSize, 1, 'team-size');
  if (size !== 1 && size !== 2 && size !== 3) throw new Error('--team-size must be 1, 2 or 3');
  const ai = num(aiLevel, 3, 'ai-level');
  if (!Number.isInteger(ai) || ai < 1 || ai > 5) throw new Error('--ai-level must be an integer 1..5');
  return { ruleset: ruleset ?? 'classic', teamSize: size, aiLevel: ai };
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
        ruleset: { type: 'string' },
        'team-size': { type: 'string' },
        'ai-level': { type: 'string' },
        'no-traps': { type: 'boolean' },
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
      ...(values['max-ticks'] === undefined ? {} : { maxTicks: num(values['max-ticks'], DEFAULT_MAX_TICKS, 'max-ticks') }),
      stalemateTicks: num(values['stalemate-ticks'], DEFAULT_STALEMATE_TICKS, 'stalemate-ticks'),
      ...parseRuleOptions(values.ruleset, values['team-size'], values['ai-level']),
      ...(values['no-traps'] === true ? { noTraps: true } : {}),
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
    console.error('usage: pnpm sim:match --a <race> --b <race> [--agents scripted,random] [--seeds N] [--seed S] [--level L] [--difficulty D] [--ruleset classic|arcade] [--team-size 1|2|3] [--ai-level 1..5] [--no-traps] [--json]');
    console.error('       pnpm sim:match --tournament [--seeds N] [--agents ...] [--json]');
    return 2;
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}
