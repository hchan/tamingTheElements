import { KO_ENTRANCE_INVULN_TICKS, TAG_INVULN_TICKS } from '../../../data/arcade';
import { isArcade, now } from '../../clock';
import { SimEventKind, type EventSink } from '../../events';
import { ARCADE_E, ArcadeE, cooldownIdx, EntityFlag } from '../../state';
import type { SimWorld } from '../../world';
import { castSelf } from '../abilities';
import { castMelee } from '../melee';
import { fire } from '../projectile';

/**
 * The tag entrance (FUN-DESIGN 2.6), called by `performSwap` once `to` is in play at `from`'s position: `to` takes
 * `from`'s facing and aim, is invulnerable TAG_INVULN_TICKS (KO_ENTRANCE_INVULN_TICKS when `from` was KO'd), and casts
 * its primary at once through the usual cast path (meter, press, count) with its cooldown left as it was: the entrance
 * attack is free. Emits `tagIn {from, to, team, entrance}` (`entrance` 1 when the attack was cast; it is not when `to`
 * cannot act, e.g. outside the fight phase or with guard held, or its primary is at its active cap). The team's combo
 * counter is untouched, so a tag while the opponent is stunned continues the combo. Returns at once in Classic.
 */
export function tagEntrance(world: SimWorld, sink: EventSink, team: number, from: number, to: number): void {
  const s = world.state;
  if (!isArcade(s)) return;
  const a = s.arcade;
  const g = now(s);
  const e = to * ARCADE_E;
  a[e + ArcadeE.invulnUntil] = g + ((s.flags[from] ?? 0) & EntityFlag.dead ? KO_ENTRANCE_INVULN_TICKS : TAG_INVULN_TICKS);
  a[e + ArcadeE.aim] = a[from * ARCADE_E + ArcadeE.aim] ?? 0;
  s.dir[to] = s.dir[from] ?? 0;
  const cd = cooldownIdx(to, 0);
  const ready = s.abil[cd] ?? 0;
  s.abil[cd] = 0;
  castSelf(world, sink, team, 0, g);
  castMelee(world, sink, team, 0, g);
  fire(world, sink, team, to, 0, g);
  const entrance = s.abil[cd] === 0 ? 0 : 1;
  s.abil[cd] = ready;
  sink.emit(to, SimEventKind.tagIn, { from, to, team, entrance });
}
