import { ALL_ABILITIES } from '../../data/abilities-all';
import type { AbilityDefB } from '../../data/abilities-b';
import { EntityFlag, MAX_ENTITIES, STATUS_SLOTS, STATUS_STRIDE } from '../state';
import type { SimState } from '../state';
import type { SimWorld } from '../world';
import { now } from '../clock';
import { SUPER_ARMOUR_PCT } from '../../data/arcade-supers';

/**
 * Status framework. Each entity owns STATUS_SLOTS slots of [id, sourceId, startTick, expireTick, magnitude].
 * Ordering is deterministic: new statuses take the lowest free slot, expiry runs by ascending entity id
 * then slot index. Timers are tick-based (intentional divergence: legacy used Date/Delay, which kept
 * running while paused).
 */
export const StatusId = {
  none: 0, adrenaline: 1, fireDance: 2, rockArmour: 3, translucent: 4, tornado: 5, iceBlast: 6,
  /** Arcade supers only (WP-arcade-supers): a speed bonus, 50% armour and the tidal slow. */
  superSpeed: 7, superArmour: 8, superSlow: 9,
  /**
   * Crowd control (flag withCrowdControl, SIM_VERSION 70, systems/arcade/cc.ts). Ids 10+ never carry a speed delta:
   * the status system restores speed only for ids up to superSlow. 14 and 15 are hidden (not HUD words).
   * 16-17 are roster statuses, 18-20 over-time, 21+ reserved.
   */
  dazed: 10, iced: 11, downed: 12, silenced: 13, ccWard: 14, kindled: 15,
  /** Roster batch 2 (SIM_VERSION 73): Brazgor's molten-hide, rock-armour style armour plus thorns on melee attackers. */
  thorns: 16,
  /** Roster batch 3 (SIM_VERSION 74): a damage-over-time wound (Vortigal's talon-rake, Umbrel's spore-burst); see systems/arcade/wound.ts. */
  wound: 17,
  /** Over-time (flag withOverTime, SIM_VERSION 75, systems/arcade/over-time.ts): burning and venom are DoTs, mending a HoT. 21 is reserved. */
  burning: 18, venom: 19, mending: 20,
} as const;
export type StatusIdValue = (typeof StatusId)[keyof typeof StatusId];

const F_ID = 0;
const F_SOURCE = 1;
const F_START = 2;
const F_EXPIRE = 3;
const F_MAG = 4;

/** Ability slug -> status it applies. */
const BUFF_STATUS: Readonly<Record<string, StatusIdValue>> = {
  adrenaline: StatusId.adrenaline,
  'fire-dance': StatusId.fireDance,
  'rock-armour': StatusId.rockArmour,
  'translucent-flame': StatusId.translucent,
  fade: StatusId.translucent,
  'molten-hide': StatusId.thorns,
};

const DEFS: readonly AbilityDefB[] = ALL_ABILITIES;
/** Statuses that reduce incoming damage, and the ability that defines the percentage. */
const STATUS_ABILITY: Readonly<Record<number, string>> = {
  [StatusId.adrenaline]: 'adrenaline',
  [StatusId.rockArmour]: 'rock-armour',
  [StatusId.thorns]: 'molten-hide',
};

function defFor(slug: string): AbilityDefB {
  const d = DEFS.find((a) => a.id === slug);
  if (!d) throw new RangeError(`unknown ability ${slug}`);
  return d;
}

function base(id: number, slot: number): number {
  return (id * STATUS_SLOTS + slot) * STATUS_STRIDE;
}

function damageDecreaseOf(statusId: number): number {
  if (statusId === StatusId.superArmour) return SUPER_ARMOUR_PCT;
  const slug = STATUS_ABILITY[statusId];
  return slug === undefined ? 0 : (defFor(slug).damageDecreasePercentage ?? 0);
}

/**
 * Applies a buff ability to an entity and returns true, or false if it is not a buff or all slots are
 * full. Speed changes additively like legacy (`characterSpeed += speedIncrease`), so stacking adds up
 * (Adrenaline x2 = +10 speed, 50% decrease). The legacy second-stack sprite crash ("rightFrames" of
 * undefined, cosmetic) is not reproduced.
 * Fire Dance's random y jitter: in legacy it only moves the cosmetic overlay sprite, never the
 * character, so no RNG is drawn here (the WP text assumed it moved the character; the source says
 * otherwise). If it ever moves the character it must draw from `combat`, not `cosmetic`.
 */
export function applyBuff(world: SimWorld, id: number, abilitySlug: string, sourceId = id): boolean {
  const statusId = BUFF_STATUS[abilitySlug];
  if (statusId === undefined) return false;
  const s = world.state;
  let slot = 0;
  while (slot < STATUS_SLOTS && (s.status[base(id, slot) + F_ID] ?? 0) !== StatusId.none) slot++;
  if (slot === STATUS_SLOTS) return false;
  const def = defFor(abilitySlug);
  const tick = now(s);
  const speedDelta = def.speedDelta ?? 0;
  const b = base(id, slot);
  s.status[b + F_ID] = statusId;
  s.status[b + F_SOURCE] = sourceId;
  s.status[b + F_START] = tick;
  s.status[b + F_EXPIRE] = tick + (def.durationTicks ?? 0);
  s.status[b + F_MAG] = speedDelta;
  s.speed[id] = (s.speed[id] ?? 0) + speedDelta;
  if (statusId === StatusId.translucent) s.flags[id] = (s.flags[id] ?? 0) | EntityFlag.translucent;
  return true;
}

/** Super-status speed deltas are stored in thousandths: the status block is integer, half an odd speed is not. */
export const SUPER_MAG_SCALE = 1000;

/**
 * Arcade super effects: a timed status of `ticks` game ticks with a speed change `speedDelta` (restored at expiry by the
 * status system); the translucent status also sets the flag. False when every slot is taken.
 */
export function applyTimedStatus(
  world: SimWorld, id: number, statusId: StatusIdValue, sourceId: number, ticks: number, speedDelta: number,
): boolean {
  const s = world.state;
  let slot = 0;
  while (slot < STATUS_SLOTS && (s.status[base(id, slot) + F_ID] ?? 0) !== StatusId.none) slot++;
  if (slot === STATUS_SLOTS) return false;
  const tick = now(s);
  const b = base(id, slot);
  s.status[b + F_ID] = statusId;
  s.status[b + F_SOURCE] = sourceId;
  s.status[b + F_START] = tick;
  s.status[b + F_EXPIRE] = tick + ticks;
  s.status[b + F_MAG] = Math.round(speedDelta * SUPER_MAG_SCALE);
  s.speed[id] = (s.speed[id] ?? 0) + speedDelta;
  if (statusId === StatusId.translucent) s.flags[id] = (s.flags[id] ?? 0) | EntityFlag.translucent;
  return true;
}

/** Fire Heal: heal = ability heal x healMult, capped at maxHp (legacy `heal`). */
export function applyHeal(world: SimWorld, id: number, abilitySlug: string): void {
  const s = world.state;
  const amount = (defFor(abilitySlug).heal ?? 0) * (s.healMult[id] ?? 0);
  s.hp[id] = Math.min((s.hp[id] ?? 0) + amount, s.maxHp[id] ?? 0);
}

/** Total incoming-damage decrease percentage from active statuses (Adrenaline 25, Rock Armour 75, stacking). */
export function damageDecreasePct(s: SimState, id: number): number {
  let pct = 0;
  for (let slot = 0; slot < STATUS_SLOTS; slot++) pct += damageDecreaseOf(s.status[base(id, slot) + F_ID] ?? 0);
  return pct;
}

/** Damage a melee attacker takes per hit that lands on `id`: the thorns status (molten-hide), 0 without it. */
export function thornsDamageOf(s: SimState, id: number): number {
  let n = 0;
  for (let slot = 0; slot < STATUS_SLOTS; slot++) {
    if ((s.status[base(id, slot) + F_ID] ?? 0) === StatusId.thorns) n += defFor('molten-hide').thornsDamage ?? 0;
  }
  return n;
}

/** Legacy applyDamage tail: `damage -= damage * pct / 100`, floored at 0. */
export function reduceDamage(s: SimState, id: number, damage: number): number {
  const out = damage - (damage * damageDecreasePct(s, id)) / 100;
  return out < 0 ? 0 : out;
}

/** Translucent entities are skipped by projectiles and melee (legacy `isTranslucent`). */
export function isTranslucent(s: SimState, id: number): boolean {
  return ((s.flags[id] ?? 0) & EntityFlag.translucent) !== 0;
}

export interface StatusInfo {
  readonly id: StatusIdValue;
  readonly sourceId: number;
  readonly startTick: number;
  readonly expireTick: number;
  readonly magnitude: number;
}

/** HUD view of an entity's active statuses in slot order. */
export function listStatuses(s: SimState, id: number): StatusInfo[] {
  const out: StatusInfo[] = [];
  for (let slot = 0; slot < STATUS_SLOTS; slot++) {
    const b = base(id, slot);
    const sid = (s.status[b + F_ID] ?? 0) as StatusIdValue;
    if (sid === StatusId.none) continue;
    out.push({
      id: sid,
      sourceId: s.status[b + F_SOURCE] ?? 0,
      startTick: s.status[b + F_START] ?? 0,
      expireTick: s.status[b + F_EXPIRE] ?? 0,
      magnitude: s.status[b + F_MAG] ?? 0,
    });
  }
  return out;
}

/** Empties every slot of an entity (for despawn / slot reuse). */
export function clearStatuses(s: SimState, id: number): void {
  s.status.fill(0, base(id, 0), base(id, STATUS_SLOTS));
}

/**
 * Expires statuses whose expireTick has been reached. Like legacy, speed and damage decrease are
 * restored even if the entity died; translucency is only cleared while alive (a dead entity stays
 * translucent, as in the translucency:dead fixtures).
 */
export function statusSystem(world: SimWorld): void {
  const s = world.state;
  const tick = now(s);
  for (let id = 0; id < MAX_ENTITIES; id++) {
    for (let slot = 0; slot < STATUS_SLOTS; slot++) {
      const b = base(id, slot);
      const sid = s.status[b + F_ID] ?? 0;
      if (sid === StatusId.none || (s.status[b + F_EXPIRE] ?? 0) > tick) continue;
      if (sid <= StatusId.superSlow) {
        s.speed[id] = (s.speed[id] ?? 0) - (s.status[b + F_MAG] ?? 0) / (sid >= StatusId.superSpeed ? SUPER_MAG_SCALE : 1);
      }
      if (sid === StatusId.translucent && ((s.flags[id] ?? 0) & EntityFlag.alive) !== 0) {
        s.flags[id] = (s.flags[id] ?? 0) & ~EntityFlag.translucent;
      }
      s.status.fill(0, b, b + STATUS_STRIDE);
    }
  }
}

/** Slot index of the first status `sid` on `id`, or -1. Non-allocating (hot path). */
export function statusSlot(s: SimState, id: number, sid: number): number {
  for (let slot = 0; slot < STATUS_SLOTS; slot++) if ((s.status[base(id, slot) + F_ID] ?? 0) === sid) return slot;
  return -1;
}

/** True when `id` holds status `sid`. */
export function hasStatus(s: SimState, id: number, sid: number): boolean {
  return statusSlot(s, id, sid) >= 0;
}

/** Offset of a status field in `state.status` for (`id`, `slot`): `statusBase(id, slot) + StatusField.x`. */
export function statusBase(id: number, slot: number): number {
  return base(id, slot);
}
export const StatusField = { id: F_ID, source: F_SOURCE, start: F_START, expire: F_EXPIRE, mag: F_MAG } as const;

/** Removes the first status `sid` from `id` without any speed restore (ids 10+ carry none). True when one was removed. */
export function removeStatus(s: SimState, id: number, sid: number): boolean {
  const slot = statusSlot(s, id, sid);
  if (slot < 0) return false;
  const b = base(id, slot);
  s.status.fill(0, b, b + STATUS_STRIDE);
  return true;
}
