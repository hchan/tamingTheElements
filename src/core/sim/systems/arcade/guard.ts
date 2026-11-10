import {
  BLOCK_STUN_TICKS, GUARD_BREAK_STUN_TICKS, GUARD_DRAIN_PM, GUARD_MAX, GUARD_REGEN, METER_PARRY, PARRY_LOCK_TICKS,
  PARRY_STUN_TICKS, PARRY_TICKS,
} from '../../../data/arcade';
import { now } from '../../clock';
import { SimEventKind, type EventSink } from '../../events';
import { ARCADE_E, ArcadeE, countIdx, EntityKind } from '../../state';
import type { SimWorld } from '../../world';
import { abilitySlot, releaseCount } from '../ability-info';
import { controlledId } from '../movement';
import { pending, Press, usePress } from './buffer';
import { gainMeter, meterForDamage } from './meter';
import { applyStun, isGuarding, isReady } from './stun';

/**
 * The `input` slot's guard pass for `team` (FUN-DESIGN 2.8), on unfrozen ticks after the dash: the controlled
 * character's guard meter regenerates GUARD_REGEN while it does not guard, and a pending guard press (buffered like the
 * dash) starts a parry window once the character `isReady`: a hit 0..PARRY_TICKS game ticks later is parried. The
 * window's end plus PARRY_LOCK_TICKS is the whiff lock (a parry clears it); a press before it is dropped, so mashing
 * never parries.
 */
export function guardTick(world: SimWorld, team: number): void {
  const s = world.state;
  const a = s.arcade;
  const id = controlledId(world, team);
  if (id < 0) return;
  const e = id * ARCADE_E;
  const g = now(s);
  if (!isGuarding(s, id)) a[e + ArcadeE.guardDrain] = Math.max(0, (a[e + ArcadeE.guardDrain] ?? 0) - GUARD_REGEN);
  const locked = g < (a[e + ArcadeE.parryLockUntil] ?? 0);
  if (!pending(s, team, Press.guard) || !(locked || isReady(s, id))) return;
  usePress(s, team, Press.guard);
  if (locked) return;
  a[e + ArcadeE.parryUntil] = g + PARRY_TICKS + 1;
  a[e + ArcadeE.parryLockUntil] = g + PARRY_TICKS + 1 + PARRY_LOCK_TICKS;
}

/**
 * Parries the hit of `source` on `victim` when the victim's parry window is open (FUN-DESIGN 2.8) and returns true: the
 * window closes and the whiff lock clears, a projectile is reflected (its velocity and dir reverse, its team and owner
 * become the parrier's, and its active count moves with it), a melee stuns `attacker` for PARRY_STUN_TICKS; then
 * `parried {target, attacker, reflected}` and METER_PARRY for the parrier. The caller adds the hit-stop.
 */
export function parry(world: SimWorld, sink: EventSink, source: number, attacker: number, victim: number): boolean {
  const s = world.state;
  const a = s.arcade;
  const e = victim * ARCADE_E;
  if ((a[e + ArcadeE.parryUntil] ?? 0) <= now(s)) return false;
  a[e + ArcadeE.parryUntil] = 0;
  a[e + ArcadeE.parryLockUntil] = 0;
  const team = s.team[victim] ?? 0;
  const reflected = s.kind[source] === EntityKind.projectile ? 1 : 0;
  if (reflected) {
    const def = s.defId[source] ?? 0;
    releaseCount(s, s.owner[source] ?? 0, def);
    const slot = abilitySlot(s, victim, def);
    if (slot >= 0) s.abil[countIdx(victim, slot)] = (s.abil[countIdx(victim, slot)] ?? 0) + 1;
    s.vx[source] = -(s.vx[source] ?? 0);
    s.vy[source] = -(s.vy[source] ?? 0);
    s.dir[source] = ((s.dir[source] ?? 0) + 4) & 7;
    s.team[source] = team;
    s.owner[source] = victim;
  } else {
    applyStun(world, sink, source, attacker, PARRY_STUN_TICKS);
  }
  sink.emit(source, SimEventKind.parried, { target: victim, attacker, reflected });
  gainMeter(s, sink, source, team, METER_PARRY);
  return true;
}

/**
 * A guarded hit by `source` that removed `dealt` (the chip) from `victim`: BLOCK_STUN_TICKS of block-stun and the guard
 * meter drains `floor(dealt * GUARD_DRAIN_PM / maxHp)`. Emptied, the guard breaks: `guardBroken {target}` and
 * GUARD_BREAK_STUN_TICKS of hit-stun (through `applyStun`, so the caps apply) instead of the block-stun.
 */
export function blockHit(world: SimWorld, sink: EventSink, source: number, victim: number, dealt: number): void {
  const s = world.state;
  const a = s.arcade;
  const e = victim * ARCADE_E;
  const drain = Math.min(GUARD_MAX, (a[e + ArcadeE.guardDrain] ?? 0) + meterForDamage(dealt, s.maxHp[victim] ?? 0, GUARD_DRAIN_PM));
  a[e + ArcadeE.guardDrain] = drain;
  const broken = drain >= GUARD_MAX;
  a[e + ArcadeE.blockUntil] = broken ? 0 : now(s) + BLOCK_STUN_TICKS;
  if (!broken) return;
  sink.emit(source, SimEventKind.guardBroken, { target: victim });
  applyStun(world, sink, source, victim, GUARD_BREAK_STUN_TICKS);
}
