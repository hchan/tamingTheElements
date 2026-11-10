import type { Command } from './commands';
import type { EventSink, SimEvent } from './events';
import { EventSink as Sink } from './events';
import { movementSystem } from './systems/movement';
import { World as W } from './state';
import type { SimWorld } from './world';

type System = (world: SimWorld, cmds: readonly [Command, Command], sink: EventSink) => void;

const noop: System = () => undefined;

/** Fixed system order; systems not yet implemented are no-ops. */
export const SYSTEMS: readonly (readonly [string, System])[] = [
  ['input', noop],
  ['movement', movementSystem],
  ['abilities', noop],
  ['projectiles', noop],
  ['collision', noop],
  ['health', noop],
  ['status', noop],
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
