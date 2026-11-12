import { isArcade, isFrozen } from '../../clock';
import type { Command } from '../../commands';
import type { EventSink } from '../../events';
import { TEAM_COUNT } from '../../state';
import type { SimWorld } from '../../world';
import { recordPresses } from './buffer';
import { expireCombos } from './combo';
import { startCharge } from './charge';
import { startDash } from './dash';
import { castElemental, expireElementals } from './elemental';
import { guardTick } from './guard';
import { controlledId } from '../movement';
import { expireRoots } from './snag';
import { expireStuns } from './stun';
import { terrainTick } from './terrain-layout';
import { weatherTick } from './weather';

/**
 * The `input` slot (FUN-DESIGN 2.1), the only system that runs while frozen. Returns at once in Classic. Every Arcade
 * tick records the press edges for the input buffer (2.12), so presses made while frozen are kept. Expiry waits for an
 * unfrozen tick (the game clock stands still while frozen, so nothing can expire then and a frozen step stays silent):
 * stuns that ran out give `recovered` (reason 0), then combos whose victim is free give `comboEnded`, then Snag roots that ran out give `snag` expired (arcade/snag.ts,
 * FUN-DESIGN 2.20), then elemental buffs that ran out give `elementalEnded` (arcade/elemental.ts, FUN-DESIGN 2.24). Then pending
 * dash presses start dashes (arcade/dash.ts, FUN-DESIGN 2.7) and charge presses charges (arcade/charge.ts, 2.17), then the guard pass runs (arcade/guard.ts, FUN-DESIGN
 * 2.8: guard meter regeneration and parry windows) and pending elemental presses (arcade/elemental.ts), then the weather pass (arcade/weather.ts, FUN-DESIGN 2.14: expiry,
 * then casts), then the terrain pass (arcade/terrain.ts, FUN-DESIGN 2.15: a telegraphed swap landing, patch enter and
 * leave events, the water patch heal).
 */
export function arcadeInputSystem(world: SimWorld, cmds: readonly [Command, Command], sink: EventSink): void {
  const s = world.state;
  if (!isArcade(s)) return;
  recordPresses(s, cmds);
  if (isFrozen(s)) return;
  expireStuns(world, sink);
  expireCombos(world, sink);
  expireRoots(world, sink);
  expireElementals(world, sink);
  for (let team = 0; team < TEAM_COUNT; team++) {
    startDash(world, sink, team, cmds[team] ?? 0);
    startCharge(world, sink, team, controlledId(world, team), controlledId(world, 1 - team));
    guardTick(world, team);
    castElemental(world, sink, team);
  }
  weatherTick(world, sink);
  terrainTick(world, sink);
}
