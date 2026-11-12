import { ELEMENTAL_COOLDOWN_TICKS, ELEMENTAL_TICKS } from '../../../data/arcade';
import { inFight, now } from '../../clock';
import { SimEventKind, type EventSink } from '../../events';
import { ARCADE_E, ArcadeE, EntityFlag, MAX_ENTITIES } from '../../state';
import type { SimWorld } from '../../world';
import { cleanseSlows } from '../debuffs';
import { controlledId } from '../movement';
import { pending, Press, usePress } from './buffer';
import { freeRoot } from './snag';
import { isFree } from './stun';
import { kindOf } from './terrain';

/**
 * The elemental ability (FUN-DESIGN 2.24, ideas/in-progress/elemental-ability.md): `Cmd.elemental` (bit 10, buffered)
 * fires the controlled hero's element ability, with no meter, on a per-character cooldown by element
 * (ELEMENTAL_COOLDOWN_TICKS, game ticks, reset each round with the rest of the Arcade entity block). Fire (Ember), air
 * (Gale) and earth (Stoneskin) start a ELEMENTAL_TICKS buff (`elemUntil`, read by arcade/elemental-buff.ts); water
 * (Cleanse) at once ends the hero's Snag root (`snag` freed, the usual immunity follows), its Puddle slow and its Ice
 * Blast and tidal slows. Void heroes have none.
 */

const WATER = 2;

/**
 * `team`'s controlled hero casts on a pending elemental press. Refused (the press stays buffered) outside the fight,
 * while not `isFree` (stunned, dashing, charging, in a super, block-stun or weather recovery), on cooldown, or for a void
 * hero. A rooted or guarding hero may cast (Cleanse is the way out of a root). Emits `elementalCast {element, team,
 * cleared}` (element: the weather kind 1..4; cleared: debuffs ended by a Cleanse, else 0).
 */
export function castElemental(world: SimWorld, sink: EventSink, team: number): void {
  const s = world.state;
  const id = controlledId(world, team);
  if (id < 0 || !pending(s, team, Press.elemental) || !inFight(s) || !isFree(s, id)) return;
  const kind = kindOf(s, id);
  const cooldown = ELEMENTAL_COOLDOWN_TICKS[kind] ?? 0;
  const e = id * ARCADE_E;
  const g = now(s);
  if (cooldown === 0 || g < (s.arcade[e + ArcadeE.elemReadyAt] ?? 0)) return;
  s.arcade[e + ArcadeE.elemReadyAt] = g + cooldown;
  let cleared = 0;
  if (kind === WATER) {
    if ((s.arcade[e + ArcadeE.rootUntil] ?? 0) > g) cleared++;
    freeRoot(s, sink, id, id);
    if ((s.arcade[e + ArcadeE.trapSlowUntil] ?? 0) > g) cleared++;
    s.arcade[e + ArcadeE.trapSlowUntil] = 0;
    cleared += cleanseSlows(world, id);
  } else {
    s.arcade[e + ArcadeE.elemUntil] = g + ELEMENTAL_TICKS;
  }
  usePress(s, team, Press.elemental);
  sink.emit(id, SimEventKind.elementalCast, { element: kind, team, cleared });
}

/** Buffs whose time ran out end with `elementalEnded {element}`, once; a downed hero's buff ends silently. */
export function expireElementals(world: SimWorld, sink: EventSink): void {
  const s = world.state;
  const g = now(s);
  for (let id = 0; id < MAX_ENTITIES; id++) {
    const at = id * ARCADE_E + ArcadeE.elemUntil;
    const until = s.arcade[at] ?? 0;
    if (until === 0 || until > g) continue;
    s.arcade[at] = 0;
    if (((s.flags[id] ?? 0) & (EntityFlag.alive | EntityFlag.dead)) === EntityFlag.alive) {
      sink.emit(id, SimEventKind.elementalEnded, { element: kindOf(s, id) });
    }
  }
}
