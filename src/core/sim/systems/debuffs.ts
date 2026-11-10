import { ABILITIES_A } from '../../data/abilities-a';
import { ABILITIES_B } from '../../data/abilities-b';
import { EntityFlag, MAX_ENTITIES, STATUS_SLOTS, STATUS_STRIDE, World as W } from '../state';
import type { SimWorld } from '../world';
import { StatusId } from './status';

/**
 * Hostile debuffs applied by projectile hits: Tornado (freeze) and Ice Blast (slow). Timers are
 * tick-based. They use the status slots of systems/status.ts, but expire here (registered before the
 * status system) because their expiry rules differ from buffs. Entangling Vines lives in melee.ts.
 */
const TORNADO_TICKS = defTicks('tornado');
const ICE_BLAST_TICKS = defTicks('ice-blast');
const ICE_BLAST_DELTA = ABILITIES_B.find((d) => d.id === 'ice-blast')?.speedDelta ?? 0;

function defTicks(slug: string): number {
  return (
    ABILITIES_A.find((d) => d.id === slug)?.durationTicks ?? ABILITIES_B.find((d) => d.id === slug)?.durationTicks ?? 0
  );
}

function base(id: number, slot: number): number {
  return (id * STATUS_SLOTS + slot) * STATUS_STRIDE;
}

function isDead(flags: Int32Array, id: number): boolean {
  return ((flags[id] ?? 0) & EntityFlag.alive) === 0;
}

function addSlot(world: SimWorld, victim: number, statusId: number, caster: number, ticks: number): void {
  const s = world.state;
  let slot = 0;
  while (slot < STATUS_SLOTS && (s.status[base(victim, slot)] ?? 0) !== StatusId.none) slot++;
  if (slot === STATUS_SLOTS) return;
  const tick = s.world[W.tick] ?? 0;
  const b = base(victim, slot);
  s.status[b] = statusId;
  s.status[b + 1] = caster;
  s.status[b + 2] = tick;
  s.status[b + 3] = tick + ticks;
  s.status[b + 4] = 0;
}

/**
 * Called by the projectile system when a Tornado or Ice Blast bullet hits `victim`. Translucent
 * victims are immune. Returns true if a debuff was applied.
 */
export function onProjectileHit(world: SimWorld, abilitySlug: string, victim: number, caster: number): boolean {
  const s = world.state;
  if (((s.flags[victim] ?? 0) & EntityFlag.translucent) !== 0) return false;
  if (abilitySlug === 'tornado') {
    s.flags[victim] = (s.flags[victim] ?? 0) | EntityFlag.frozen;
    addSlot(world, victim, StatusId.tornado, caster, TORNADO_TICKS);
    return true;
  }
  if (abilitySlug === 'ice-blast') {
    s.speed[victim] = (s.speed[victim] ?? 0) + ICE_BLAST_DELTA;
    // Legacy clamp: a negative speed becomes half the default speed.
    if ((s.speed[victim] ?? 0) < 0) s.speed[victim] = (s.baseSpeed[victim] ?? 0) / 2;
    addSlot(world, victim, StatusId.iceBlast, caster, ICE_BLAST_TICKS);
    return true;
  }
  return false;
}

/**
 * Expires Tornado and Ice Blast. Like legacy, nothing is undone if the caster is dead (the victim
 * stays frozen / slowed). Each expiry acts independently, so stacked casts unwind one at a time and
 * the first Tornado expiry unfreezes even while another is still running (as Vines, KNOWN-BUG:vines-stacking).
 * Ice Blast restore: speed below 0.2 snaps to the default speed, otherwise the slow is added back.
 */
export function debuffSystem(world: SimWorld): void {
  const s = world.state;
  const tick = s.world[W.tick] ?? 0;
  for (let id = 0; id < MAX_ENTITIES; id++) {
    for (let slot = 0; slot < STATUS_SLOTS; slot++) {
      const b = base(id, slot);
      const sid = s.status[b] ?? 0;
      if ((sid !== StatusId.tornado && sid !== StatusId.iceBlast) || (s.status[b + 3] ?? 0) > tick) continue;
      const caster = s.status[b + 1] ?? 0;
      if (!isDead(s.flags, caster)) {
        if (sid === StatusId.tornado) {
          s.flags[id] = (s.flags[id] ?? 0) & ~EntityFlag.frozen;
        } else if ((s.speed[id] ?? 0) < 0.2) {
          s.speed[id] = s.baseSpeed[id] ?? 0;
        } else {
          s.speed[id] = (s.speed[id] ?? 0) - ICE_BLAST_DELTA;
        }
      }
      s.status.fill(0, b, b + STATUS_STRIDE);
    }
  }
}
