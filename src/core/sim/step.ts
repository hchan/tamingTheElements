import type { Command } from './commands';
import type { EventSink, SimEvent } from './events';
import { EventSink as Sink } from './events';
import { deathSystem } from './systems/death';
import { movementSystem } from './systems/movement';
import { statusSystem } from './systems/status';
import { restSystem } from './systems/rest';
import { swapSystem } from './systems/swap';
import { meleeSystem } from './systems/melee';
import { World as W } from './state';
import type { SimWorld } from './world';

type System = (world: SimWorld, cmds: readonly [Command, Command], sink: EventSink) => void;

const noop: System = () => undefined;

/** Fixed system order; systems not yet implemented are no-ops. */
export const SYSTEMS: readonly (readonly [string, System])[] = [
  ['input', noop],
  ['swap', swapSystem],
  ['movement', movementSystem],
  ['abilities', noop],
  ['melee', meleeSystem],
  ['projectiles', noop],
  ['collision', noop],
  ['health', noop],
  ['death', deathSystem],
  ['status', statusSystem],
  ['rest', restSystem],
  ['cleanup', noop],
];

/** Advances the world one 50 Hz tick and returns the events it produced. */
export function step(world: SimWorld, cmds: readonly [Command, Command]): readonly SimEvent[] {
  const w = world.state.world;
  const sink = new Sink(w[W.tick] ?? 0);
  for (const [, system] of SYSTEMS) system(world, cmds, sink);
  w[W.tick] = (w[W.tick] ?? 0) + 1;
  return sink.events;
}
