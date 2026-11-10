import { ABILITIES_A } from '../../../data/abilities-a';
import { ABILITIES_B } from '../../../data/abilities-b';
import {
  HIT_STOP_TICKS, HIT_STUN_TICKS, HitStopCause, HitStrength, KNOCKBACK_Q4, KO_HIT_STOP_TICKS, comboScalePm, hitStrengthFor,
  hitStunFor, type HitStrengthValue,
} from '../../../data/arcade';
import { CHARACTERS } from '../../../data/characters';
import { computeDamage, damageDealt } from '../../../rules/damage';
import { SimEventKind, type EventSink } from '../../events';
import { ARCADE_WORLD_BASE, ArcadeW, World as W } from '../../state';
import type { SimWorld } from '../../world';
import { damageDecreasePct } from '../status';
import { addComboDamage, comboHit, isCounterHit } from './combo';
import { knockbackDir, setKnockback } from './knockback';
import { meterOnHit } from './meter';
import { applyStun } from './stun';

/** Strength tier per ability def index (set A then set B: the ABILITY_DEFS order of projectile.ts and melee.ts). */
export const HIT_STRENGTH: readonly HitStrengthValue[] = [...ABILITIES_A, ...ABILITIES_B].map((d) =>
  hitStrengthFor(d.id, d.damage ?? 0, d.kind === 'melee'),
);
/** Base hit-stun per ability def index (FUN-DESIGN 2.3; Tornado and Entangling Vines stun 60). */
export const HIT_STUN: readonly number[] = [...ABILITIES_A, ...ABILITIES_B].map((d, i) =>
  hitStunFor(d.id, HIT_STRENGTH[i] ?? HitStrength.light),
);
/** Def index of the super's hitbox entity (arcade/super.ts), right after the abilities: strength 3 (super). */
export const SUPER_DEF = HIT_STRENGTH.length;

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
 * `computeDamage` arithmetic times the combo scale (FUN-DESIGN 2.4: `scalePm / 1000` by the hit's combo index; a hit
 * on a free victim ends the team's live combo and starts a new one). Emits `damage` (as Classic projectiles do) and
 * `hitConfirmed`, then hit-stop by strength, or the KO hit-stop when the hit empties the victim's HP. Then knockback by
 * strength and hit-stun with the juggle and stun caps (FUN-DESIGN 2.3; `recovered` follows the `hitStop` when a cap
 * ends the combo); a counter hit (victim in its own cast recovery) stuns one tier more. Last, both teams' hyper meters
 * gain from the health removed (FUN-DESIGN 2.5, `meterLevel` when a bar fills). Returns the health removed.
 */
export function applyArcadeHit(
  world: SimWorld, sink: EventSink, source: number, attacker: number, victim: number, base: number, defIdx: number,
  dir: number,
): number {
  const s = world.state;
  const team = s.team[source] ?? 0;
  const counter = isCounterHit(s, victim);
  const combo = comboHit(world, sink, source, team, victim);
  const strength = defIdx === SUPER_DEF ? HitStrength.super : (HIT_STRENGTH[defIdx] ?? HitStrength.light);
  const scalePm = comboScalePm(combo, strength);
  const raw = computeDamage({
    base,
    attackerMult: s.dmgMult[attacker] ?? 1,
    attEl: CHARACTERS[s.defId[attacker] ?? 0]?.element ?? 'void',
    defEl: CHARACTERS[s.defId[victim] ?? 0]?.element ?? 'void',
    defReductionPct: damageDecreasePct(s, victim),
  });
  // Unscaled hits keep the Classic value exactly (x * 1000 / 1000 can round).
  const amount = scalePm === 1000 ? raw : (raw * scalePm) / 1000;
  const before = s.hp[victim] ?? 0;
  s.hp[victim] = before - amount;
  addComboDamage(s, team, amount);
  sink.emit(source, SimEventKind.damage, { target: victim, attacker, amount });
  sink.emit(source, SimEventKind.hitConfirmed, {
    target: victim, attacker, ability: defIdx, strength, amount, scalePm, combo, dir, counter: counter ? 1 : 0,
  });
  const ko = before > 0 && before - amount <= 0;
  const ticks = ko ? KO_HIT_STOP_TICKS : HIT_STOP_TICKS[strength];
  hitStop(world, sink, source, ticks, ko ? HitStopCause.ko : HitStopCause.hit);
  setKnockback(s, victim, KNOCKBACK_Q4[strength], knockbackDir(s, source, victim, dir));
  const stun = HIT_STUN[defIdx] ?? HIT_STUN_TICKS[strength];
  applyStun(world, sink, source, victim, counter ? Math.max(stun, HIT_STUN_TICKS[Math.min(strength + 1, 3)] ?? stun) : stun);
  const dealt = damageDealt(before, amount);
  meterOnHit(s, sink, source, team, victim, dealt);
  return dealt;
}
