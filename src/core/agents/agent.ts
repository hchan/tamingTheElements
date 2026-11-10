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

export interface Agent {
  readonly id: string;
  observe(view: ObservationView, tick: number): Command;
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
