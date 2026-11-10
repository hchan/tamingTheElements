import type { Command } from './commands';
import type { EventSink, SimEvent } from './events';
import { EventSink as Sink } from './events';
import { deathSystem } from './systems/death';
import { debuffSystem } from './systems/debuffs';
import { movementSystem } from './systems/movement';
import { statusSystem } from './systems/status';
import { restSystem } from './systems/rest';
import { abilitiesSystem } from './systems/abilities';
import { swapSystem } from './systems/swap';
import { meleeSystem } from './systems/melee';
import { captureSystem } from './systems/capture';
import { projectileSystem } from './systems/projectile';
import { endSystem } from './systems/end';
import { arcadeInputSystem } from './systems/arcade/input';
import { World as W } from './state';
import { advanceGameClock, isFrozen } from './clock';
import type { SimWorld } from './world';

type System = (world: SimWorld, cmds: readonly [Command, Command], sink: EventSink) => void;

const noop: System = () => undefined;

/** Leading SYSTEMS entries that run even while an Arcade freeze holds the game clock: just `input`. */
export const UNFROZEN_SYSTEMS = 1;

/** Fixed system order; systems not yet implemented are no-ops. */
export const SYSTEMS: readonly (readonly [string, System])[] = [
  ['input', arcadeInputSystem],
  ['swap', swapSystem],
  ['movement', movementSystem],
  ['abilities', abilitiesSystem],
  ['melee', meleeSystem],
  ['projectiles', projectileSystem],
  ['capture', captureSystem],
  ['collision', noop],
  ['health', noop],
  ['death', deathSystem],
  ['debuffs', debuffSystem],
  ['status', statusSystem],
  ['rest', restSystem],
  ['cleanup', noop],
  ['end', endSystem],
];

/**
 * Advances the world one 50 Hz tick and returns the events it produced. The first UNFROZEN_SYSTEMS slots (`input`) run
 * every tick; while an Arcade freeze holds the game clock (`isFrozen`, never true in Classic) every other system is
 * skipped and the game clock stays put. `W.tick` always advances.
 */
export function step(world: SimWorld, cmds: readonly [Command, Command]): readonly SimEvent[] {
  const s = world.state;
  const w = s.world;
  const sink = new Sink(w[W.tick] ?? 0);
  let frozen = false;
  for (const [i, [, system]] of SYSTEMS.entries()) {
    if (i === UNFROZEN_SYSTEMS) frozen = isFrozen(s);
    if (frozen) break;
    system(world, cmds, sink);
  }
  w[W.tick] = (w[W.tick] ?? 0) + 1;
  if (!frozen) advanceGameClock(s);
  return sink.events;
}
