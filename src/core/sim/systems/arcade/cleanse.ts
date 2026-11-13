import { CLEANSE_COOLDOWN_TICKS } from '../../../data/arcade';
import { inFight, now } from '../../clock';
import { SimEventKind, type EventSink } from '../../events';
import { ARCADE_E, ArcadeE } from '../../state';
import type { SimWorld } from '../../world';
import { cleanseSlows } from '../debuffs';
import { controlledId } from '../movement';
import { pending, Press, usePress } from './buffer';
import { freeRoot } from './snag';
import { isFree } from './stun';
import { kindOf } from './terrain';

/**
 * The common Cleanse (ideas/in-progress/elemental-cleanse.md): `Cmd.cleanse` (bit 9, buffered) ends the controlled hero's
 * debuffs, the same for all 12 heroes, on a CLEANSE_COOLDOWN_TICKS (10 s) cooldown held per character in
 * `ArcadeE.cleanseReadyAt`. Cleansable: the Snag root (the usual post-root immunity follows), the Puddle slow and the Ice
 * Blast and tidal slows. There is no burn or silence in the sim; stun is not a debuff Cleanse can end.
 */

/** Number of debuffs on `id` that Cleanse would end now. */
export function cleansableCount(world: SimWorld, id: number): number {
  const s = world.state;
  const e = id * ARCADE_E;
  const g = now(s);
  let n = 0;
  if ((s.arcade[e + ArcadeE.rootUntil] ?? 0) > g) n++;
  if ((s.arcade[e + ArcadeE.trapSlowUntil] ?? 0) > g) n++;
  return n + cleanseSlows(world, id, true);
}

/**
 * `team`'s controlled hero casts on a pending cleanse press. Refused (the press stays buffered) outside the fight, while
 * not `isFree`, or on cooldown. A rooted or guarding hero may cast. Emits `cleanse {element, team, cleared}` (element:
 * the hero's kind, 1..4 or 5 for void; cleared: debuffs ended, possibly 0).
 */
export function castCleanse(world: SimWorld, sink: EventSink, team: number): void {
  const s = world.state;
  const id = controlledId(world, team);
  if (id < 0 || !pending(s, team, Press.cleanse) || !inFight(s) || !isFree(s, id)) return;
  const e = id * ARCADE_E;
  const g = now(s);
  if (g < (s.arcade[e + ArcadeE.cleanseReadyAt] ?? 0)) return;
  s.arcade[e + ArcadeE.cleanseReadyAt] = g + CLEANSE_COOLDOWN_TICKS;
  let cleared = 0;
  if ((s.arcade[e + ArcadeE.rootUntil] ?? 0) > g) cleared++;
  freeRoot(s, sink, id, id);
  if ((s.arcade[e + ArcadeE.trapSlowUntil] ?? 0) > g) cleared++;
  s.arcade[e + ArcadeE.trapSlowUntil] = 0;
  cleared += cleanseSlows(world, id);
  usePress(s, team, Press.cleanse);
  sink.emit(id, SimEventKind.cleanse, { element: kindOf(s, id), team, cleared });
}
