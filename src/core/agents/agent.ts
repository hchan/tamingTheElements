import { type Command, NO_COMMAND } from '../sim/commands';
import {
  ARCADE_E,
  ARCADE_T,
  ARCADE_TEAM_BASE,
  ARCADE_WORLD_BASE,
  ArcadeE,
  ArcadeT,
  ArcadeW,
  cooldownIdx,
  EntityFlag,
  EntityKind,
  World,
  type SimState,
} from '../sim/state';
import type { SimWorld } from '../sim/world';
import { isArcade, now, roundPhase } from '../sim/clock';
import { Press, pressAge } from '../sim/systems/arcade/buffer';

/** Read-only snapshot of one fighter; plain numbers, never aliases sim arrays. */
export interface FighterView {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly hp: number;
  readonly maxHp: number;
  readonly flags: number;
  readonly alive: boolean;
}

/** Read-only facade over a SimWorld for one side. Mutable arrays are never exposed. */
export interface ObservationView {
  readonly side: 0 | 1;
  readonly tick: number;
  /** The side's active fighter, or undefined when none is on the field. */
  readonly self: FighterView | undefined;
  readonly opponent: FighterView | undefined;
  /** Ticks until each ability slot of this side is ready (0 = ready). */
  readonly cooldowns: readonly number[];
  /** The match seed, so an agent can seed its own stream (`AgentRng`); agents never draw from the sim's streams. */
  readonly matchSeed: number;
  /** Arcade state both players can see on the HUD (FUN-DESIGN 2.11); absent in Classic. */
  readonly arcade?: ArcadeView;
}

/**
 * Read-only copy of the visible Arcade state for one side: nothing a human could not read off the screen. Stun is in
 * game ticks left (0 = free), `freeze` in `W.tick` ticks left of a hit-stop or super freeze. Own cooldowns are
 * `ObservationView.cooldowns` (game ticks in Arcade).
 */
export interface ArcadeView {
  readonly meter: number;
  readonly oppMeter: number;
  readonly selfStun: number;
  readonly oppStun: number;
  readonly freeze: number;
  /** Live combo hits of this side (on the opponent) and of the opponent (on this side). */
  readonly combo: number;
  readonly oppCombo: number;
  /** This side's super is running (its caster cannot act until it ends). */
  readonly superActive: boolean;
  /** Round phase (a `RoundPhase`, FUN-DESIGN 2.10): only `fight` (1) lets anyone act. */
  readonly phase: number;
  /**
   * This side's last command as the sim recorded it, and the game ticks since its last primary and secondary press (-1:
   * none, or used by a super chord), so an agent can see whether a press would complete a chord (FUN-DESIGN 2.12).
   */
  readonly prevCmd: Command;
  readonly primaryAge: number;
  readonly secondaryAge: number;
}

/** Opaque, JSON-serialisable agent memory: what `Agent.save` returns and only the same kind of agent can `load`. */
export type AgentState =
  null | boolean | number | string | readonly AgentState[] | { readonly [key: string]: AgentState };

export interface Agent {
  readonly id: string;
  observe(view: ObservationView, tick: number): Command;
  /**
   * Everything that can change a later command (memory, timers, random stream) as fresh plain data that shares
   * nothing with the agent. Agent memory is not in SimState, so a rollback must restore it next to the world.
   */
  save(): AgentState;
  /** Exact inverse of save(): afterwards the agent issues the same commands as the one that was saved. */
  load(state: AgentState): void;
}

/**
 * Both sides' agent memory at one tick, stored next to the world snapshot of that tick (`SnapshotRing<AgentSnapshot>`)
 * so a restore rewinds the bots as well as the sim.
 */
export type AgentSnapshot = readonly [AgentState, AgentState];

export function saveAgents(agents: readonly [Agent | undefined, Agent | undefined]): AgentSnapshot {
  return [agents[0]?.save() ?? null, agents[1]?.save() ?? null];
}

export function loadAgents(
  agents: readonly [Agent | undefined, Agent | undefined],
  snap: AgentSnapshot,
): void {
  agents[0]?.load(snap[0]);
  agents[1]?.load(snap[1]);
}

/** Reads a saved agent state back as a record; throws when it is not one (a state from another kind of agent). */
export function stateRecord(state: AgentState, id: string): { readonly [key: string]: AgentState } {
  if (state === null || typeof state !== 'object' || Array.isArray(state)) {
    throw new TypeError(`${id}: agent state is not a record`);
  }
  return state as { readonly [key: string]: AgentState };
}

/** A number field of a saved agent state; throws when it is missing or not a number. */
export function stateNumber(rec: { readonly [key: string]: AgentState }, key: string): number {
  const v = rec[key];
  if (typeof v !== 'number') throw new TypeError(`agent state field ${key} is not a number`);
  return v;
}

function fighterOf(world: SimWorld, team: number): FighterView | undefined {
  const s = world.state;
  for (let i = 0; i < s.kind.length; i++) {
    const flags = s.flags[i] ?? 0;
    if (s.kind[i] !== EntityKind.character || s.team[i] !== team) continue;
    if ((flags & EntityFlag.alive) === 0 || (flags & EntityFlag.benched) !== 0) continue;
    return {
      id: i,
      x: s.x[i] ?? 0,
      y: s.y[i] ?? 0,
      w: s.w[i] ?? 0,
      h: s.h[i] ?? 0,
      hp: s.hp[i] ?? 0,
      maxHp: s.maxHp[i] ?? 0,
      flags,
      alive: true,
    };
  }
  return undefined;
}

function arcadeViewOf(
  s: SimState,
  side: number,
  self: FighterView | undefined,
  opp: FighterView | undefined,
): ArcadeView {
  const a = s.arcade;
  const g = now(s);
  const team = (t: number, f: number): number => a[ARCADE_TEAM_BASE + t * ARCADE_T + f] ?? 0;
  const stun = (f: FighterView | undefined): number =>
    f === undefined ? 0 : Math.max(0, (a[f.id * ARCADE_E + ArcadeE.stunUntil] ?? 0) - g);
  return {
    meter: team(side, ArcadeT.meter),
    oppMeter: team(1 - side, ArcadeT.meter),
    selfStun: stun(self),
    oppStun: stun(opp),
    freeze: Math.max(
      0,
      (a[ARCADE_WORLD_BASE + ArcadeW.freezeUntil] ?? 0) - (s.world[World.tick] ?? 0),
    ),
    combo: team(side, ArcadeT.comboHits),
    oppCombo: team(1 - side, ArcadeT.comboHits),
    superActive: team(side, ArcadeT.superState) !== 0,
    phase: roundPhase(s),
    prevCmd: team(side, ArcadeT.prevCmd),
    primaryAge: pressAge(s, side, Press.primary),
    secondaryAge: pressAge(s, side, Press.secondary),
  };
}

export function createObservationView(world: SimWorld, side: 0 | 1): ObservationView {
  const s = world.state;
  const tick = s.world[World.tick] ?? 0;
  const gameTick = now(s);
  const self = fighterOf(world, side);
  const opponent = fighterOf(world, 1 - side);
  return {
    side,
    tick,
    matchSeed: s.world[World.matchSeed] ?? 0,
    self,
    opponent,
    // The active character's own cooldowns (legacy abilitiesInfo is per character).
    cooldowns: Array.from({ length: 4 }, (_, k) =>
      self === undefined ? 0 : Math.max(0, (s.abil[cooldownIdx(self.id, k)] ?? 0) - gameTick),
    ),
    ...(isArcade(s) && { arcade: arcadeViewOf(s, side, self, opponent) }),
  };
}

/**
 * Runs one agent per side and returns the command pair for `step`. Reads the world only: SimState is mutated by
 * `step` alone, so consulting agents (or not) never changes the state or its hash.
 */
export function collectCommands(
  world: SimWorld,
  agents: readonly [Agent | undefined, Agent | undefined],
): [Command, Command] {
  const tick = world.state.world[World.tick] ?? 0;
  const out: [Command, Command] = [NO_COMMAND, NO_COMMAND];
  for (const side of [0, 1] as const) {
    out[side] = agents[side]?.observe(createObservationView(world, side), tick) ?? NO_COMMAND;
  }
  return out;
}
