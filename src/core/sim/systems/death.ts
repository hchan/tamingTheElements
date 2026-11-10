import type { Command } from '../commands';
import { SimEventKind, type EventSink } from '../events';
import { EntityFlag, EntityKind, MAX_ENTITIES } from '../state';
import type { SimWorld } from '../world';
import { nextAliveTeammate, performSwap } from './swap';

/**
 * Death is decided here, at the end of the tick, from hp alone (legacy did it in HUD refresh:
 * known bug death-in-hud, fixed by construction). The active character's death auto-swaps to the
 * next alive teammate; with none left the team is wiped (the match layer reads that).
 */
export function deathSystem(
  world: SimWorld,
  _cmds: readonly [Command, Command],
  sink: EventSink,
): void {
  const s = world.state;
  for (let id = 0; id < MAX_ENTITIES; id++) {
    const f = s.flags[id] ?? 0;
    if (
      (f & (EntityFlag.alive | EntityFlag.dead)) !== EntityFlag.alive ||
      s.kind[id] !== EntityKind.character ||
      (s.hp[id] ?? 0) > 0 ||
      (s.maxHp[id] ?? 0) <= 0
    )
      continue;
    const wasActive = (f & EntityFlag.benched) === 0;
    s.hp[id] = 0;
    s.dmgMult[id] = 0;
    // Stays `alive` (slot occupied); `dead|benched` take it out of play and out of every hit test.
    s.flags[id] = f | EntityFlag.dead | EntityFlag.benched;
    s.w[id] = 0;
    s.h[id] = 0;
    const team = s.team[id] ?? 0;
    sink.emit(id, SimEventKind.died, { team });
    if (!wasActive) continue;
    const next = nextAliveTeammate(world, team, id);
    if (next >= 0) performSwap(world, sink, team, id, next);
  }
}
