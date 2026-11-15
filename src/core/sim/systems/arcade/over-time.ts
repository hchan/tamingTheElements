import { ALL_ABILITIES } from '../../../data/abilities-all';
import { HitStrength, OT_DOT_FLOOR_HP, OT_HEAL_INSTANT_PM, OT_RIDERS, OT_SPECS, OT_VENOM_HEAL_PM, OtEnd, OtKind, OtRefresh } from '../../../data/arcade';
import { flagBit } from '../../../flags';
import { inFight, isArcade, now } from '../../clock';
import { SimEventKind, type EventSink } from '../../events';
import { EntityFlag, MAX_ENTITIES, STATUS_SLOTS, World as W, type SimState } from '../../state';
import type { SimWorld } from '../../world';
import { removeStatus, StatusField, StatusId, statusBase, statusSlot } from '../status';

/**
 * Over-time statuses (flag withOverTime, Arcade only; ideas/brainstorm/hot-dot-abilities.md): burning 18 and venom 19 are
 * damage over time, mending 20 heals over time. All state lives in the existing status slots: source = applier, start = phase
 * anchor (kept on refresh), expire = end tick, mag = stacks. Every export returns first when the flag is off.
 */
const OT_BIT = flagBit('withOverTime');

/** Over-time kind (OtKind) -> status id. */
const KIND_STATUS = [StatusId.burning, StatusId.venom, StatusId.mending] as const;

/** OT_RIDERS per ability def index, resolved once: [defIdx, kind] pairs. */
const RIDER_TABLE: readonly (readonly [number, number])[] = OT_RIDERS.map((r) => {
  const def = ALL_ABILITIES.findIndex((d) => d.id === r.slug);
  if (def < 0) throw new Error(`OT_RIDERS: unknown ability ${r.slug}`);
  return [def, r.kind] as const;
});

/** True when the match runs Arcade with `withOverTime` set. Reads the hashed world flag bits, never a module variable. */
export function otOn(s: SimState): boolean {
  return isArcade(s) && ((s.world[W.flags] ?? 0) & OT_BIT) !== 0;
}

const isLive = (s: SimState, id: number): boolean =>
  ((s.flags[id] ?? 0) & EntityFlag.alive) !== 0 && ((s.flags[id] ?? 0) & EntityFlag.dead) === 0 && (s.hp[id] ?? 0) > 0;

/** Heal scale per mille on `id`: OT_VENOM_HEAL_PM while venomed (flag on), else 1000. */
export function healFactorPm(s: SimState, id: number): number {
  return otOn(s) && statusSlot(s, id, StatusId.venom) >= 0 ? OT_VENOM_HEAL_PM : 1000;
}

/**
 * Leaves over-time `kind` (OtKind) from `source` on `victim`. A held status is refreshed in place (stack rule: one more stack up
 * to the cap; both rules extend the end; `start` is kept so a re-hit never moves the next pulse). Otherwise the lowest free
 * slot is taken; none free is a silent no-op. Returns true when it wrote.
 */
export function applyOt(world: SimWorld, _sink: EventSink, source: number, victim: number, kind: number): boolean {
  const s = world.state;
  const spec = OT_SPECS[kind];
  const sid = KIND_STATUS[kind];
  if (!otOn(s) || spec === undefined || sid === undefined || !inFight(s) || !isLive(s, victim)) return false;
  const t = now(s);
  const held = statusSlot(s, victim, sid);
  if (held >= 0) {
    const b = statusBase(victim, held);
    if (spec.refresh === OtRefresh.stack) {
      s.status[b + StatusField.mag] = Math.min((s.status[b + StatusField.mag] ?? 0) + 1, spec.maxStacks);
    }
    s.status[b + StatusField.source] = source;
    s.status[b + StatusField.expire] = t + spec.durationTicks;
    return true;
  }
  for (let slot = 0; slot < STATUS_SLOTS; slot++) {
    const b = statusBase(victim, slot);
    if ((s.status[b + StatusField.id] ?? 0) !== StatusId.none) continue;
    s.status[b + StatusField.id] = sid;
    s.status[b + StatusField.source] = source;
    s.status[b + StatusField.start] = t;
    s.status[b + StatusField.expire] = t + spec.durationTicks;
    s.status[b + StatusField.mag] = 1;
    return true;
  }
  return false;
}

/** Applies the over-time riders of the hit's ability (a landed, unguarded, non-super hit). */
export function otRiders(world: SimWorld, sink: EventSink, attacker: number, victim: number, defIdx: number): void {
  if (!otOn(world.state)) return;
  for (const [def, kind] of RIDER_TABLE) if (def === defIdx) applyOt(world, sink, attacker, victim, kind);
}

/**
 * Per game tick, after `wound` and before `status`: every live over-time pulses when its age is a positive multiple of its
 * period (the last pulse lands on the expiry tick, before `status` clears it). Pulses are not hits: no hit-stop, stun, combo,
 * meter or knockback. A DoT never takes a hero below OT_DOT_FLOOR_HP and emits `damage` plus `otPulse`; a HoT emits `otPulse`.
 */
export function overTimeSystem(world: SimWorld, _cmds: unknown, sink: EventSink): void {
  const s = world.state;
  if (!otOn(s) || !inFight(s)) return;
  const g = now(s);
  for (let id = 0; id < MAX_ENTITIES; id++) {
    if (!isLive(s, id)) continue;
    for (let slot = 0; slot < STATUS_SLOTS; slot++) {
      const b = statusBase(id, slot);
      const sid = s.status[b + StatusField.id] ?? 0;
      if (sid < StatusId.burning || sid > StatusId.mending) continue;
      const spec = OT_SPECS[sid - StatusId.burning];
      if (spec === undefined) continue;
      const age = g - (s.status[b + StatusField.start] ?? 0);
      if (age <= 0 || age % spec.periodTicks !== 0) continue;
      const source = s.status[b + StatusField.source] ?? 0;
      const amount = spec.amount * (s.status[b + StatusField.mag] ?? 1);
      const hp = s.hp[id] ?? 0;
      if (spec.heal) {
        const healed = Math.min(Math.trunc((amount * healFactorPm(s, id)) / 1000), (s.maxHp[id] ?? 0) - hp);
        if (healed <= 0) continue;
        s.hp[id] = hp + healed;
        sink.emit(id, SimEventKind.otPulse, { id, status: sid, amount: healed, source, heal: 1 });
      } else {
        const dealt = Math.min(amount, hp - OT_DOT_FLOOR_HP);
        if (dealt <= 0) continue;
        s.hp[id] = hp - dealt;
        sink.emit(id, SimEventKind.damage, { target: id, attacker: source, amount: dealt });
        sink.emit(id, SimEventKind.otPulse, { id, status: sid, amount: dealt, source, heal: 0 });
      }
    }
  }
}

const CLEANSABLE = [StatusId.burning, StatusId.venom] as const;

/** Cleanse: removes burning and venom from `id` (each counts 1), emitting `otEnded {reason: cleansed}`. Returns the number removed. */
export function cleanseOt(world: SimWorld, sink: EventSink, id: number): number {
  const s = world.state;
  if (!otOn(s)) return 0;
  let n = 0;
  for (const sid of CLEANSABLE) {
    if (!removeStatus(s, id, sid)) continue;
    n++;
    sink.emit(id, SimEventKind.otEnded, { id, status: sid, reason: OtEnd.cleansed });
  }
  return n;
}

/** Read-only twin of `cleanseOt`: how many over-time debuffs Cleanse would end on `id` now. */
export function cleansableOt(s: SimState, id: number): number {
  if (!otOn(s)) return 0;
  let n = 0;
  for (const sid of CLEANSABLE) if (statusSlot(s, id, sid) >= 0) n++;
  return n;
}

/**
 * Heal ability with the flag on (fire-heal, mycelium-mend): the instant part is `heal * healMult * OT_HEAL_INSTANT_PM / 1000`
 * (scaled by `healFactorPm`), the rest arrives as the caster's mending. Returns false when the flag is off (caller heals as before).
 */
export function healWithMending(world: SimWorld, sink: EventSink, id: number, heal: number): boolean {
  const s = world.state;
  if (!otOn(s)) return false;
  const instant = Math.trunc((heal * (s.healMult[id] ?? 0) * OT_HEAL_INSTANT_PM * healFactorPm(s, id)) / 1_000_000);
  s.hp[id] = Math.min((s.hp[id] ?? 0) + instant, s.maxHp[id] ?? 0);
  applyOt(world, sink, id, id, OtKind.mending);
  return true;
}

/** A landed heavy or super hit that is not guarded ends the victim's mending (`otEnded {reason: broken}`). */
export function breakMending(world: SimWorld, sink: EventSink, victim: number, strength: number): void {
  const s = world.state;
  if (!otOn(s) || strength < HitStrength.heavy) return;
  if (removeStatus(s, victim, StatusId.mending)) sink.emit(victim, SimEventKind.otEnded, { id: victim, status: StatusId.mending, reason: OtEnd.broken });
}
