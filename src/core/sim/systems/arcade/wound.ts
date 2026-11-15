import type { AbilityDefB } from '../../../data/abilities-b';
import { ALL_ABILITIES } from '../../../data/abilities-all';
import { now } from '../../clock';
import { SimEventKind, type EventSink } from '../../events';
import { EntityFlag, MAX_ENTITIES, STATUS_SLOTS, type SimState } from '../../state';
import type { SimWorld } from '../../world';
import { removeStatus, StatusField, StatusId, statusBase } from '../status';
import { setLunge } from './knockback';

/** Game ticks between two pulses of a wound (roster batch 3: Vortigal's talon-rake, Umbrel's spore-burst). */
export const WOUND_PULSE_TICKS = 30;

/**
 * Leaves a wound on `victim` when the hit's ability has one (`woundDamage` per pulse, `woundTicks` long). A fresh wound
 * replaces the old one (no stacking), and takes the lowest free status slot; none free means no wound.
 */
export function applyWound(s: SimState, attacker: number, victim: number, def: AbilityDefB): void {
  const dmg = def.woundDamage ?? 0;
  if (dmg <= 0) return;
  removeStatus(s, victim, StatusId.wound);
  for (let slot = 0; slot < STATUS_SLOTS; slot++) {
    const b = statusBase(victim, slot);
    if ((s.status[b + StatusField.id] ?? 0) !== StatusId.none) continue;
    const t = now(s);
    s.status[b + StatusField.id] = StatusId.wound;
    s.status[b + StatusField.source] = attacker;
    s.status[b + StatusField.start] = t;
    s.status[b + StatusField.expire] = t + (def.woundTicks ?? 0);
    s.status[b + StatusField.mag] = dmg;
    return;
  }
}

/**
 * Pull and throw riders, after the hit's own knockback: a pull drags the victim `pullPx` px back toward the caster (the
 * projectile's dir reversed), a grab throws it `grabThrowPx` px along `dir` (the caster-to-victim direction).
 */
export function displaceVictim(s: SimState, victim: number, dir: number, def: AbilityDefB, pullDir: number): void {
  if ((def.pullPx ?? 0) > 0) setLunge(s, victim, def.pullPx ?? 0, pullDir);
  else if (def.grab === true && (def.grabThrowPx ?? 0) > 0) setLunge(s, victim, def.grabThrowPx ?? 0, dir);
}

/** The ability def at `defIdx`, or undefined for the special hit ids (supers, charge, traps). */
export function riderDef(defIdx: number): AbilityDefB | undefined {
  return ALL_ABILITIES[defIdx];
}

/**
 * Per game tick, before the status system: every live wound pulses `mag` damage each WOUND_PULSE_TICKS since it began
 * (the last pulse lands on the expiry tick). Wounds bypass armour and guard; a victim already at 0 HP is left alone.
 */
export function woundSystem(world: SimWorld, _cmds: unknown, sink: EventSink): void {
  const s = world.state;
  const g = now(s);
  for (let id = 0; id < MAX_ENTITIES; id++) {
    if (((s.flags[id] ?? 0) & EntityFlag.alive) === 0) continue;
    for (let slot = 0; slot < STATUS_SLOTS; slot++) {
      const b = statusBase(id, slot);
      if ((s.status[b + StatusField.id] ?? 0) !== StatusId.wound) continue;
      const age = g - (s.status[b + StatusField.start] ?? 0);
      if (age <= 0 || age % WOUND_PULSE_TICKS !== 0 || (s.hp[id] ?? 0) <= 0) continue;
      const amount = s.status[b + StatusField.mag] ?? 0;
      s.hp[id] = (s.hp[id] ?? 0) - amount;
      sink.emit(id, SimEventKind.damage, { target: id, attacker: s.status[b + StatusField.source] ?? 0, amount });
    }
  }
}

