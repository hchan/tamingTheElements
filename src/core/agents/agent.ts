import { type Command, NO_COMMAND } from '../sim/commands';
import { EntityFlag, EntityKind, TEAM_STRIDE, TeamField, World } from '../sim/state';
import type { SimWorld } from '../sim/world';

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
}

/** Opaque, JSON-serialisable agent memory: what `Agent.save` returns and only the same kind of agent can `load`. */
export type AgentState = null | boolean | number | string | readonly AgentState[] | { readonly [key: string]: AgentState };

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

export function loadAgents(agents: readonly [Agent | undefined, Agent | undefined], snap: AgentSnapshot): void {
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

export function createObservationView(world: SimWorld, side: 0 | 1): ObservationView {
  const s = world.state;
  const tick = s.world[World.tick] ?? 0;
  const base = side * TEAM_STRIDE;
  return {
    side,
    tick,
    matchSeed: s.world[World.matchSeed] ?? 0,
    self: fighterOf(world, side),
    opponent: fighterOf(world, 1 - side),
    cooldowns: Array.from({ length: 4 }, (_, k) =>
      Math.max(0, (s.teams[base + TeamField.swapCooldownUntil + 1 + k] ?? 0) - tick),
    ),
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
