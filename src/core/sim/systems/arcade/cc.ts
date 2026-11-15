import {
  CC_DR_RESET_TICKS, CC_RIDERS, ChargeEnd, CcBucket, CcEnd, CcKind, CcResist, DAZE_GRACE_TICKS, DAZE_MASH_TICKS,
  DAZE_MIN_TICKS, ICE_GRACE_TICKS, ICE_SHATTER_PM, QUICK_RISE_TICKS, QUICK_RISE_WINDOW_TICKS, SILENCE_TICKS,
  WAKE_INVULN_TICKS, Weather,
} from '../../../data/arcade';
import { ABILITIES_A } from '../../../data/abilities-a';
import { ABILITIES_B } from '../../../data/abilities-b';
import { CHARACTERS } from '../../../data/characters';
import { inFight, now } from '../../clock';
import { SimEventKind, type EventSink } from '../../events';
import {
  ARCADE_E, ARCADE_WORLD_BASE, ArcadeE, ArcadeW, EntityFlag, MAX_ENTITIES, STATUS_SLOTS, STATUS_STRIDE, type SimState,
} from '../../state';
import type { SimWorld } from '../../world';
import { cleanseSlows } from '../debuffs';
import { controlledId } from '../movement';
import { StatusField, StatusId, removeStatus, statusBase, statusSlot } from '../status';
import { Press, pending, pressAge, usePress } from './buffer';
import { ccHeld, ccLevel, ccOn, isChilled } from './cc-state';
import { endCharge } from './charge-move';

/**
 * Crowd control (flag withCrowdControl, SIM_VERSION 70). The states are statuses of the fixed status array (daze 10,
 * iced 11, downed 12, silenced 13) plus two hidden ones: the diminishing-returns ward (14) and the Ember prime
 * `kindled` (15). Every function returns first when `!ccOn(s)`, so a match without the flag is unchanged.
 */

/** CC_RIDERS per ability def index (set A then set B, as HIT_STUN), resolved once: [defIdx, kind, ticks] triples. */
const RIDER_TABLE: readonly (readonly [number, number, number, boolean])[] = CC_RIDERS.map((r) => {
  const def = [...ABILITIES_A, ...ABILITIES_B].findIndex((d) => d.id === r.slug);
  if (def < 0) throw new Error(`CC_RIDERS: unknown ability ${r.slug}`);
  return [def, r.kind, r.ticks, r.chilled === true] as const;
});

const WEATHER = ARCADE_WORLD_BASE + ArcadeW.weather;

/** Per CcKind (index = kind): the status id and the DR bucket. */
const KIND_STATUS = [0, StatusId.dazed, StatusId.iced, StatusId.downed, StatusId.silenced] as const;
const KIND_BUCKET = [0, CcBucket.disorient, CcBucket.incapacitate, CcBucket.stun, CcBucket.silence] as const;

const isLive = (s: SimState, id: number): boolean =>
  ((s.flags[id] ?? 0) & (EntityFlag.alive | EntityFlag.dead)) === EntityFlag.alive;

function resisted(sink: EventSink, source: number, victim: number, kind: number, reason: number): false {
  sink.emit(source, SimEventKind.ccResisted, { id: victim, cc: kind, reason });
  return false;
}

/** First empty status slot of `id` other than `skip`, or -1. */
function freeSlot(s: SimState, id: number, skip: number): number {
  for (let slot = 0; slot < STATUS_SLOTS; slot++) {
    if (slot !== skip && (s.status[statusBase(id, slot) + StatusField.id] ?? 0) === StatusId.none) return slot;
  }
  return -1;
}

function write(s: SimState, id: number, slot: number, sid: number, source: number, start: number, expire: number): void {
  const b = statusBase(id, slot);
  s.status[b + StatusField.id] = sid;
  s.status[b + StatusField.source] = source;
  s.status[b + StatusField.start] = start;
  s.status[b + StatusField.expire] = expire;
  s.status[b + StatusField.mag] = 0;
}

/**
 * Applies crowd-control `kind` (a CcKind) of base `ticks` to `victim` on behalf of `attacker`; `source` is the event's
 * source entity. Needs the flag, a live victim and the fight phase (else false, silently). Refused with `ccResisted`:
 * `busy` (a hard CC on a victim already held, a silence on a silenced one, ice under Sunshine), `immune` (its DR bucket
 * is at level 2) and `full` (no free status slot for the state and the ward). Otherwise the length is halved at DR level
 * 1, the state and the ward are written, and `ccStarted {id, kind, ticks, source, level}` is emitted. A hard CC ends the
 * victim's dash, interrupts its charge and replaces its hit-stun; ice also uses up the chill and the knockback. An
 * immune result does not refresh the ward.
 */
export function applyCc(
  world: SimWorld, sink: EventSink, source: number, attacker: number, victim: number, kind: number, ticks: number,
): boolean {
  const s = world.state;
  if (!ccOn(s) || kind <= CcKind.none || kind > CcKind.silenced || !isLive(s, victim) || !inFight(s)) return false;
  const sid = KIND_STATUS[kind] ?? 0;
  const bucket = KIND_BUCKET[kind] ?? 0;
  const hard = kind !== CcKind.silenced;
  const g = now(s);
  const e = victim * ARCADE_E;
  if (hard ? ccHeld(s, victim) : statusSlot(s, victim, StatusId.silenced) >= 0) {
    return resisted(sink, source, victim, kind, CcResist.busy);
  }
  if (kind === CcKind.iced && (s.arcade[WEATHER] ?? 0) === Weather.sun) {
    return resisted(sink, source, victim, kind, CcResist.busy);
  }
  const level = ccLevel(s, victim, bucket);
  if (level >= 2) return resisted(sink, source, victim, kind, CcResist.immune);
  const length = level === 1 ? ticks >> 1 : ticks;
  const wardSlot = statusSlot(s, victim, StatusId.ccWard);
  const stateSlot = freeSlot(s, victim, -1);
  if (stateSlot < 0 || (wardSlot < 0 && freeSlot(s, victim, stateSlot) < 0)) {
    return resisted(sink, source, victim, kind, CcResist.full);
  }
  if (hard) {
    if ((s.arcade[e + ArcadeE.dashUntil] ?? 0) > g) s.arcade[e + ArcadeE.dashUntil] = g;
    if ((s.arcade[e + ArcadeE.chargeUntil] ?? 0) > g) endCharge(s, sink, victim, ChargeEnd.interrupted);
    s.arcade[e + ArcadeE.stunUntil] = g;
    s.arcade[e + ArcadeE.comboStunTotal] = 0;
    s.arcade[e + ArcadeE.juggle] = 0;
  }
  if (kind === CcKind.iced) {
    cleanseSlows(world, victim);
    s.arcade[e + ArcadeE.trapSlowUntil] = 0;
    s.arcade[e + ArcadeE.kbVx] = 0;
    s.arcade[e + ArcadeE.kbVy] = 0;
  }
  if (kind === CcKind.downed) s.arcade[e + ArcadeE.invulnUntil] = g + length + WAKE_INVULN_TICKS;
  write(s, victim, stateSlot, sid, attacker, g, g + length);
  const ward = wardSlot >= 0 ? wardSlot : freeSlot(s, victim, -1);
  if (wardSlot < 0) write(s, victim, ward, StatusId.ccWard, attacker, g, 0);
  const wb = statusBase(victim, ward);
  const shift = bucket * 2;
  s.status[wb + StatusField.mag] = ((s.status[wb + StatusField.mag] ?? 0) & ~(3 << shift)) | ((level + 1) << shift);
  s.status[wb + StatusField.expire] = Math.max(s.status[wb + StatusField.expire] ?? 0, g + length + CC_DR_RESET_TICKS);
  sink.emit(source, SimEventKind.ccStarted, { id: victim, cc: kind, ticks: length, source: attacker, level });
  return true;
}

/** Ends `id`'s CC of `kind` now with `reason` (a CcEnd) and emits `ccEnded`; false when it holds none. Speed is untouched. */
export function endCc(world: SimWorld, sink: EventSink, id: number, kind: number, reason: number): boolean {
  const s = world.state;
  if (!ccOn(s) || !removeStatus(s, id, KIND_STATUS[kind] ?? 0)) return false;
  sink.emit(id, SimEventKind.ccEnded, { id, cc: kind, reason });
  return true;
}

/** Ends a silence by Cleanse (both Cleanse buttons); returns how many CCs it ended (0 or 1). */
export function cleanseCc(world: SimWorld, sink: EventSink, id: number): number {
  return endCc(world, sink, id, CcKind.silenced, CcEnd.cleansed) ? 1 : 0;
}

/** Number of CCs Cleanse would end on `id` now (read-only twin of `cleanseCc`). */
export function cleansableCc(s: SimState, id: number): number {
  return ccOn(s) && statusSlot(s, id, StatusId.silenced) >= 0 ? 1 : 0;
}

/** Writes the Ember prime on `id` until game tick `until` (Ember cast, flag on); skipped when no status slot is free. */
export function primeKindled(s: SimState, id: number, until: number): void {
  if (!ccOn(s)) return;
  removeStatus(s, id, StatusId.kindled);
  const slot = freeSlot(s, id, -1);
  if (slot >= 0) write(s, id, slot, StatusId.kindled, id, now(s), until);
}

/** Spends `attacker`'s Ember prime; true when it had one. */
export function spendKindled(s: SimState, attacker: number): boolean {
  return ccOn(s) && removeStatus(s, attacker, StatusId.kindled);
}

/** What the CC rules change about a hit: skip the hit's own stun, zero its knockback, scale its damage (per mille). */
export interface CcHitResult {
  replaceStun: boolean;
  noKnockback: boolean;
  bonusPm: number;
}
const result: CcHitResult = { replaceStun: false, noKnockback: false, bonusPm: 1000 };

/**
 * Before the damage of a landed (not guarded, not parried) hit: a hit on a dazed victim past DAZE_GRACE_TICKS breaks the
 * daze (`broken`; a 0-damage hit never does); on an iced one past ICE_GRACE_TICKS it shatters the ice (`shattered`,
 * `bonusPm` ICE_SHATTER_PM, none on a super), and a fire attacker's hit thaws it at once (`thawed`, no bonus). Returns
 * the shared result with `bonusPm` set (1000 = none); the other fields are reset.
 */
export function ccOnHit(
  world: SimWorld, sink: EventSink, attacker: number, victim: number, base: number, sup: boolean,
): CcHitResult {
  const s = world.state;
  result.replaceStun = false;
  result.noKnockback = false;
  result.bonusPm = 1000;
  if (!ccOn(s)) return result;
  const g = now(s);
  const daze = statusSlot(s, victim, StatusId.dazed);
  if (daze >= 0 && base > 0 && g - (s.status[statusBase(victim, daze) + StatusField.start] ?? 0) >= DAZE_GRACE_TICKS) {
    endCc(world, sink, victim, CcKind.daze, CcEnd.broken);
  }
  const ice = statusSlot(s, victim, StatusId.iced);
  if (ice >= 0) {
    if (CHARACTERS[s.defId[attacker] ?? 0]?.element === 'fire') {
      endCc(world, sink, victim, CcKind.iced, CcEnd.thawed);
    } else if (g - (s.status[statusBase(victim, ice) + StatusField.start] ?? 0) >= ICE_GRACE_TICKS) {
      if (!sup) result.bonusPm = ICE_SHATTER_PM;
      endCc(world, sink, victim, CcKind.iced, CcEnd.shattered);
    }
  }
  return result;
}

/**
 * After the damage of a landed hit: spends the attacker's Ember prime (never on a super) and silences the victim, then
 * applies the CC rider of `defIdx` (a CC_RIDERS entry: Tornado dazes; an ice hit on a chilled foe ices it). May set `replaceStun` / `noKnockback` on the shared
 * result that `ccOnHit` returned, for hit.ts to read.
 */
export function ccRiders(
  world: SimWorld, sink: EventSink, source: number, attacker: number, victim: number, defIdx: number, sup: boolean,
): CcHitResult {
  const s = world.state;
  if (!ccOn(s)) return result;
  if (!sup && spendKindled(s, attacker)) applyCc(world, sink, source, attacker, victim, CcKind.silenced, SILENCE_TICKS);
  for (const [def, kind, ticks, chilled] of RIDER_TABLE) {
    if (def !== defIdx || sup) continue;
    // An ice hit freezes only a foe already chilled; sampled here, before onProjectileHit adds this hit's own slow.
    if (chilled && !isChilled(s, victim, s.arcade[victim * ARCADE_E + ArcadeE.trapSlowUntil] ?? 0, now(s))) continue;
    if (applyCc(world, sink, source, attacker, victim, kind, ticks)) {
      result.replaceStun = true;
      result.noKnockback = kind === CcKind.iced;
    }
  }
  return result;
}

/**
 * Per game tick (flag on), before the status system: a dazed hero's team mashing (each new button press takes
 * DAZE_MASH_TICKS off, down to DAZE_MIN_TICKS from the start, and is consumed); a downed hero's Dash press in the first
 * QUICK_RISE_WINDOW_TICKS quick-rises (expiry QUICK_RISE_TICKS from the start, consumed); Sunshine thaws ice; and each CC
 * whose time ran out ends with `ccEnded` (expired, mashed or quickRise).
 */
export function ccSystem(world: SimWorld, _cmds: unknown, sink: EventSink): void {
  const s = world.state;
  if (!ccOn(s)) return;
  const g = now(s);
  const sun = (s.arcade[WEATHER] ?? 0) === Weather.sun;
  for (let id = 0; id < MAX_ENTITIES; id++) {
    for (let slot = 0; slot < STATUS_SLOTS; slot++) {
      const b = statusBase(id, slot);
      const sid = s.status[b + StatusField.id] ?? 0;
      if (sid < StatusId.dazed || sid > StatusId.silenced) continue;
      const team = s.team[id] ?? 0;
      const start = s.status[b + StatusField.start] ?? 0;
      if (sid === StatusId.dazed && controlledId(world, team) === id) {
        for (let k = 0; k <= Press.cleanse; k++) {
          if (pressAge(s, team, k) !== 0 || !pending(s, team, k)) continue;
          const expire = s.status[b + StatusField.expire] ?? 0;
          const take = Math.min(DAZE_MASH_TICKS, Math.max(0, expire - (start + DAZE_MIN_TICKS)));
          s.status[b + StatusField.expire] = expire - take;
          s.status[b + StatusField.mag] = (s.status[b + StatusField.mag] ?? 0) + take;
          usePress(s, team, k);
        }
      } else if (sid === StatusId.downed && (s.status[b + StatusField.mag] ?? 0) === 0 && controlledId(world, team) === id) {
        const age = pressAge(s, team, Press.dash);
        if (age >= 0 && pending(s, team, Press.dash) && g - age >= start && g - age <= start + QUICK_RISE_WINDOW_TICKS) {
          const rise = Math.min(s.status[b + StatusField.expire] ?? 0, start + QUICK_RISE_TICKS);
          s.status[b + StatusField.expire] = rise;
          s.status[b + StatusField.mag] = 1;
          s.arcade[id * ARCADE_E + ArcadeE.invulnUntil] = rise + WAKE_INVULN_TICKS;
          usePress(s, team, Press.dash);
        }
      }
      const kind = kindOf(sid);
      if (sid === StatusId.iced && sun) {
        s.status.fill(0, b, b + STATUS_STRIDE);
        sink.emit(id, SimEventKind.ccEnded, { id, cc: kind, reason: CcEnd.thawed });
        continue;
      }
      if ((s.status[b + StatusField.expire] ?? 0) > g) continue;
      const mag = s.status[b + StatusField.mag] ?? 0;
      const reason = sid === StatusId.dazed && mag > 0 ? CcEnd.mashed : sid === StatusId.downed && mag === 1 ? CcEnd.quickRise : CcEnd.expired;
      s.status.fill(0, b, b + STATUS_STRIDE);
      sink.emit(id, SimEventKind.ccEnded, { id, cc: kind, reason });
    }
  }
}

function kindOf(sid: number): number {
  return sid === StatusId.dazed ? CcKind.daze : sid === StatusId.iced ? CcKind.iced : sid === StatusId.downed ? CcKind.downed : CcKind.silenced;
}
