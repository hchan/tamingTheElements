import { ABILITIES_A } from '../../../data/abilities-a';
import { ABILITIES_B } from '../../../data/abilities-b';
import {
  CHARGE_STUN_TICKS, GUARD_CHIP_PM, HIT_STOP_TICKS, HIT_STUN_TICKS, HitStopCause, HitStrength, KNOCKBACK_Q4, KO_HIT_STOP_TICKS,
  PARRY_HIT_STOP_TICKS, TRAP_HIT_FLOOR, TRAP_SPIKE_STUN_TICKS, comboScalePm, hitStrengthFor, hitStunFor, type HitStrengthValue,
} from '../../../data/arcade';
import { CHARACTERS } from '../../../data/characters';
import { arcadeRaceNumbers } from '../../arcade-numbers';
import { computeDamage, damageDealt } from '../../../rules/damage';
import { now } from '../../clock';
import { SimEventKind, type EventSink } from '../../events';
import { ARCADE_T, ARCADE_TEAM_BASE, ARCADE_WORLD_BASE, ArcadeT, ArcadeW, World as W } from '../../state';
import type { SimWorld } from '../../world';
import { damageDecreasePct } from '../status';
import { addComboDamage, comboHit, isCounterHit } from './combo';
import { knockbackDir, setKnockback } from './knockback';
import { meterOnHit } from './meter';
import { blockHit, parry } from './guard';
import { applyStun, isGuarding } from './stun';
import { capDamage, terrainDamagePm } from './terrain';
import { weatherDamage } from './weather';

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
/** Def index of the charge arrival hit (arcade/charge.ts): light strength, CHARGE_STUN_TICKS of hit-stun. */
export const CHARGE_DEF = SUPER_DEF + 1;
/** Def indices of the Fire Bomb blast and the Spike (arcade/trap.ts, WP 39): medium strength; the Spike stuns longer. */
export const TRAP_BOMB_DEF = SUPER_DEF + 2;
export const TRAP_SPIKE_DEF = SUPER_DEF + 3;

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
 * `computeDamage` arithmetic, then the weather (FUN-DESIGN 2.14, `weatherDamage` of the attacker's element), then a fire
 * patch under a fire attacker (FUN-DESIGN 2.15, capped with the chart and weather at TERRAIN_CAP_PM of the plain hit), then the
 * attacker race's `damagePm` (FUN-DESIGN 2.13, `arcadeRaceNumbers`; not on a super; a trap takes it on its base, floored
 * at TRAP_HIT_FLOOR), then the combo scale (FUN-DESIGN 2.4: `scalePm / 1000` by the hit's combo index; a hit on a free victim ends the team's live
 * combo and starts a new one). Emits `damage` (as Classic projectiles do) and
 * `hitConfirmed`, then hit-stop by strength, or the KO hit-stop when the hit empties the victim's HP. Then knockback by
 * strength and hit-stun with the juggle and stun caps (FUN-DESIGN 2.3; `recovered` follows the `hitStop` when a cap
 * ends the combo); a counter hit (victim in its own cast recovery) stuns one tier more. Last, both teams' hyper meters
 * gain from the health removed (FUN-DESIGN 2.5, `meterLevel` when a bar fills). The hit is the team's last confirm
 * (`confirmTick`, the dash cancel window of FUN-DESIGN 2.7). Guard and parry (FUN-DESIGN 2.8, arcade/guard.ts; never a
 * super): a parry window turns the hit into `parried` and the parry hit-stop (no damage, returns 0); a guarding victim
 * takes GUARD_CHIP_PM of the damage with `guarded` instead of `hitConfirmed`, no combo or confirm, the light knockback
 * and block-stun instead of hit-stun. Returns the health removed.
 */
export function applyArcadeHit(
  world: SimWorld, sink: EventSink, source: number, attacker: number, victim: number, base: number, defIdx: number,
  dir: number,
): number {
  const s = world.state;
  const team = s.team[source] ?? 0;
  const strength = defIdx === SUPER_DEF ? HitStrength.super
    : defIdx >= TRAP_BOMB_DEF ? HitStrength.medium : (HIT_STRENGTH[defIdx] ?? HitStrength.light);
  // Supers are unblockable (FUN-DESIGN 2.8).
  const sup = strength === HitStrength.super;
  if (!sup && parry(world, sink, source, attacker, victim)) {
    hitStop(world, sink, source, PARRY_HIT_STOP_TICKS, HitStopCause.parry);
    return 0;
  }
  const guard = !sup && isGuarding(s, victim);
  const counter = isCounterHit(s, victim);
  const combo = guard ? 1 : comboHit(world, sink, source, team, victim);
  const scalePm = guard ? GUARD_CHIP_PM : comboScalePm(combo, strength);
  const attDef = CHARACTERS[s.defId[attacker] ?? 0];
  const attEl = attDef?.element ?? 'void';
  const defEl = CHARACTERS[s.defId[victim] ?? 0]?.element ?? 'void';
  // The attacker race's Arcade damage pm (FUN-DESIGN 2.13), never on the shared super. A trap hit takes it on its base,
  // floored at TRAP_HIT_FLOOR, before the chart (WP 39e), so a low-damagePm race's trap is not worth 13 HP.
  const pm = sup ? 1000 : arcadeRaceNumbers(attDef?.id ?? '')[1];
  const trap = defIdx === TRAP_BOMB_DEF || defIdx === TRAP_SPIKE_DEF;
  const hitBase = trap ? Math.max((base * pm) / 1000, TRAP_HIT_FLOOR) : base;
  const racePm = trap ? 1000 : pm;
  const input = { base: hitBase, attackerMult: s.dmgMult[attacker] ?? 1, attEl, defEl, defReductionPct: damageDecreasePct(s, victim) };
  let charted = weatherDamage(s, computeDamage(input), attEl);
  // Stage terrain (FUN-DESIGN 2.15): the attacker's patch bonus, the total modifier capped against the plain hit.
  const tpm = terrainDamagePm(s, attacker);
  if (tpm !== 1000) charted = capDamage(charted, tpm, computeDamage({ ...input, attEl: 'void', defEl: 'void' }));
  // 1000 keeps the value exact.
  const raw = racePm === 1000 ? charted : (charted * racePm) / 1000;
  // Unscaled hits keep the Classic value exactly (x * 1000 / 1000 can round).
  const amount = scalePm === 1000 ? raw : (raw * scalePm) / 1000;
  const before = s.hp[victim] ?? 0;
  s.hp[victim] = before - amount;
  sink.emit(source, SimEventKind.damage, { target: victim, attacker, amount });
  if (guard) {
    sink.emit(source, SimEventKind.guarded, { target: victim, attacker, chip: amount });
  } else {
    addComboDamage(s, team, amount);
    s.arcade[ARCADE_TEAM_BASE + team * ARCADE_T + ArcadeT.confirmTick] = now(s) + 1;
    sink.emit(source, SimEventKind.hitConfirmed, {
      target: victim, attacker, ability: defIdx, strength, amount, scalePm, combo, dir, counter: counter ? 1 : 0,
    });
  }
  const ko = before > 0 && before - amount <= 0;
  const ticks = ko ? KO_HIT_STOP_TICKS : HIT_STOP_TICKS[strength];
  hitStop(world, sink, source, ticks, ko ? HitStopCause.ko : HitStopCause.hit);
  setKnockback(s, victim, KNOCKBACK_Q4[guard ? HitStrength.light : strength], knockbackDir(s, source, victim, dir));
  const dealt = damageDealt(before, amount);
  const stun = defIdx === CHARGE_DEF ? CHARGE_STUN_TICKS
    : defIdx === TRAP_SPIKE_DEF ? TRAP_SPIKE_STUN_TICKS : (HIT_STUN[defIdx] ?? HIT_STUN_TICKS[strength]);
  if (guard) blockHit(world, sink, source, victim, dealt);
  else applyStun(world, sink, source, victim, counter ? Math.max(stun, HIT_STUN_TICKS[Math.min(strength + 1, 3)] ?? stun) : stun);
  meterOnHit(s, sink, source, team, victim, dealt);
  return dealt;
}
