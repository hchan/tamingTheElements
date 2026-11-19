import { type Command } from '../sim/commands';
import type { ObservationView } from './observation';
export type { ArcadeView, CcView, FighterView, HazardView, ObservationView, RockView, ShotView, TrapView } from './observation';

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

export { collectCommands, createObservationView } from './observation';
