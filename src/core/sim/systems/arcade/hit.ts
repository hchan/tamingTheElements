import { ABILITIES_A } from '../../../data/abilities-a';
import { ABILITIES_B } from '../../../data/abilities-b';
import {
  HIT_STOP_TICKS, HitStopCause, HitStrength, KO_HIT_STOP_TICKS, hitStrengthFor, type HitStrengthValue,
} from '../../../data/arcade';
import { CHARACTERS } from '../../../data/characters';
import { computeDamage, damageDealt } from '../../../rules/damage';
import { SimEventKind, type EventSink } from '../../events';
import { ARCADE_WORLD_BASE, ArcadeW, World as W } from '../../state';
import type { SimWorld } from '../../world';
import { damageDecreasePct } from '../status';

/** Strength tier per ability def index (set A then set B: the ABILITY_DEFS order of projectile.ts and melee.ts). */
export const HIT_STRENGTH: readonly HitStrengthValue[] = [...ABILITIES_A, ...ABILITIES_B].map((d) =>
  hitStrengthFor(d.id, d.damage ?? 0, d.kind === 'melee'),
);

const FREEZE_UNTIL = ARCADE_WORLD_BASE + ArcadeW.freezeUntil;
const FREEZE_KIND = ARCADE_WORLD_BASE + ArcadeW.freezeKind;

/**
 * Freezes the game clock for the `ticks` ticks after the current one (FUN-DESIGN 2.2): `freezeUntil` becomes
 * `max(freezeUntil, W.tick + 1 + ticks)`, never the sum, so overlapping hits do not stack. `freezeKind` keeps the cause
 * of the freeze that set the deadline. Emits `hitStop {ticks, cause}`.
 */
export function hitStop(world: SimWorld, sink: EventSink, source: number, ticks: number, cause: number): void {
  const a = world.state.arcade;
  const until = (world.state.world[W.tick] ?? 0) + 1 + ticks;
  if (until > (a[FREEZE_UNTIL] ?? 0)) {
    a[FREEZE_UNTIL] = until;
    a[FREEZE_KIND] = cause;
  }
  sink.emit(source, SimEventKind.hitStop, { ticks, cause });
}

/**
 * The single Arcade hit path (FUN-DESIGN 2.1): `source` (a projectile or melee entity) of ability `defIdx` hits
 * `victim` for `base` damage on behalf of `attacker`, whose multiplier and element apply. The damage is the Classic
 * `computeDamage` arithmetic. Emits `damage` (as Classic projectiles do) and `hitConfirmed`, then hit-stop by
 * strength, or the KO hit-stop when the hit empties the victim's HP. Returns the health actually removed.
 */
export function applyArcadeHit(
  world: SimWorld, sink: EventSink, source: number, attacker: number, victim: number, base: number, defIdx: number,
  dir: number,
): number {
  const s = world.state;
  const amount = computeDamage({
    base,
    attackerMult: s.dmgMult[attacker] ?? 1,
    attEl: CHARACTERS[s.defId[attacker] ?? 0]?.element ?? 'void',
    defEl: CHARACTERS[s.defId[victim] ?? 0]?.element ?? 'void',
    defReductionPct: damageDecreasePct(s, victim),
  });
  const before = s.hp[victim] ?? 0;
  s.hp[victim] = before - amount;
  const strength = HIT_STRENGTH[defIdx] ?? HitStrength.light;
  sink.emit(source, SimEventKind.damage, { target: victim, attacker, amount });
  // Combo, scaling and counter hits arrive with WP-arcade-combo; until then every hit is an unscaled first hit.
  sink.emit(source, SimEventKind.hitConfirmed, {
    target: victim, attacker, ability: defIdx, strength, amount, scalePm: 1000, combo: 1, dir, counter: 0,
  });
  const ko = before > 0 && before - amount <= 0;
  const ticks = ko ? KO_HIT_STOP_TICKS : HIT_STOP_TICKS[strength];
  hitStop(world, sink, source, ticks, ko ? HitStopCause.ko : HitStopCause.hit);
  return damageDealt(before, amount);
}
