import { isArcade, isFrozen } from '../../clock';
import type { Command } from '../../commands';
import type { EventSink } from '../../events';
import type { SimWorld } from '../../world';
import { recordPresses } from './buffer';
import { expireCombos } from './combo';
import { expireStuns } from './stun';

/**
 * The `input` slot (FUN-DESIGN 2.1), the only system that runs while frozen. Returns at once in Classic. Every Arcade
 * tick records the press edges for the input buffer (2.12), so presses made while frozen are kept. Expiry waits for an
 * unfrozen tick (the game clock stands still while frozen, so nothing can expire then and a frozen step stays silent):
 * stuns that ran out give `recovered` (reason 0), then combos whose victim is free give `comboEnded`.
 */
export function arcadeInputSystem(world: SimWorld, cmds: readonly [Command, Command], sink: EventSink): void {
  const s = world.state;
  if (!isArcade(s)) return;
  recordPresses(s, cmds);
  if (isFrozen(s)) return;
  expireStuns(world, sink);
  expireCombos(world, sink);
}
