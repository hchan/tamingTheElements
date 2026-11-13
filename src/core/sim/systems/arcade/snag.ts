import { SNAG_IMMUNE_TICKS, SNAG_ROOT_TICKS, SnagEvent } from '../../../data/arcade';
import { SIZE_ONE, sizeOfDef, sizeRootPm } from '../../../data/size';
import { isArcade, now } from '../../clock';
import { SimEventKind, type EventSink } from '../../events';
import { ARCADE_E, ArcadeE, EntityFlag, EntityKind, MAX_ENTITIES, type SimState } from '../../state';
import type { SimWorld } from '../../world';
import { isGuarding } from './stun';

/**
 * Snag (FUN-DESIGN 2.20, WP-snag): the rope throw's root. `rootUntil` is the game tick the root ends (0: none) and
 * `rootImmuneUntil` the end of the SNAG_IMMUNE_TICKS after it. A rooted fighter cannot walk, start a Dash or Charge; it
 * can still turn, aim, cast and guard. A Dash already running when the root lands carries on (the root holds after it).
 */

/** True while a Snag root holds `id`. Never true in Classic. */
export function isRooted(s: SimState, id: number): boolean {
  return isArcade(s) && (s.arcade[id * ARCADE_E + ArcadeE.rootUntil] ?? 0) > now(s);
}

/**
 * A Snag box touched `victim` (once per throw): a guarding victim wastes it (`snag` guarded), a rooted or immune one
 * ignores it (no chaining, no refresh), else it is rooted SNAG_ROOT_TICKS (`snag` rooted), scaled down by the victim's size (data/size.ts).
 */
export function snagHit(world: SimWorld, sink: EventSink, source: number, victim: number): void {
  const s = world.state;
  const e = victim * ARCADE_E;
  const g = now(s);
  if (isGuarding(s, victim)) {
    sink.emit(source, SimEventKind.snag, { id: victim, reason: SnagEvent.guarded });
    return;
  }
  if ((s.arcade[e + ArcadeE.rootUntil] ?? 0) > g || (s.arcade[e + ArcadeE.rootImmuneUntil] ?? 0) > g) return;
  const size = sizeOfDef(s.defId[victim] ?? 0);
  s.arcade[e + ArcadeE.rootUntil] = g + (size === SIZE_ONE ? SNAG_ROOT_TICKS : Math.floor((SNAG_ROOT_TICKS * sizeRootPm(size)) / 1000));
  sink.emit(source, SimEventKind.snag, { id: victim, reason: SnagEvent.rooted });
}

/** Ends `id`'s root with `reason` (freed or expired) and starts its SNAG_IMMUNE_TICKS. */
function endRoot(s: SimState, sink: EventSink, source: number, id: number, reason: number): void {
  const e = id * ARCADE_E;
  s.arcade[e + ArcadeE.rootUntil] = 0;
  s.arcade[e + ArcadeE.rootImmuneUntil] = now(s) + SNAG_IMMUNE_TICKS;
  sink.emit(source, SimEventKind.snag, { id, reason });
}

/** Fire burns the rope: a rooted `id` is freed at once (`snag` freed). A no-op when it is not rooted, and in Classic. */
export function freeRoot(s: SimState, sink: EventSink, source: number, id: number): void {
  if (isRooted(s, id)) endRoot(s, sink, source, id, SnagEvent.freed);
}

/** A Sun weather cast frees every rooted fighter. */
export function freeAllRoots(s: SimState, sink: EventSink, source: number): void {
  for (let id = 0; id < MAX_ENTITIES; id++) if (s.kind[id] === EntityKind.character) freeRoot(s, sink, source, id);
}

/** Roots whose time ran out end (`snag` expired), once; a downed fighter's root ends silently. */
export function expireRoots(world: SimWorld, sink: EventSink): void {
  const s = world.state;
  const g = now(s);
  for (let id = 0; id < MAX_ENTITIES; id++) {
    const until = s.arcade[id * ARCADE_E + ArcadeE.rootUntil] ?? 0;
    if (until === 0 || until > g) continue;
    if (((s.flags[id] ?? 0) & (EntityFlag.alive | EntityFlag.dead)) !== EntityFlag.alive) {
      s.arcade[id * ARCADE_E + ArcadeE.rootUntil] = 0;
      continue;
    }
    endRoot(s, sink, id, id, SnagEvent.expired);
  }
}
