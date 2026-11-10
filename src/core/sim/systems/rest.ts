import { EntityFlag, EntityKind, MAX_ENTITIES, World as W } from '../state';
import type { SimWorld } from '../world';

export const REST_HEAL_INTERVAL = 50;
export const REST_HEAL_FRACTION = 0.005;

/**
 * Benched, living characters heal 0.5% of maxHp every 50 ticks up to restCap.
 * Intentional divergence from legacy (rest-heal-once): Crafty's delay(-1) fired only once, so
 * legacy healed a single tick; here it repeats every second as designed.
 */
export function restSystem(world: SimWorld): void {
  const s = world.state;
  const tick = s.world[W.tick] ?? 0;
  if (tick % REST_HEAL_INTERVAL !== 0) return;
  for (let id = 0; id < MAX_ENTITIES; id++) {
    const f = s.flags[id] ?? 0;
    if (
      s.kind[id] !== EntityKind.character ||
      (f & EntityFlag.alive) === 0 ||
      (f & EntityFlag.dead) !== 0 ||
      (f & EntityFlag.benched) === 0
    )
      continue;
    const next = (s.hp[id] ?? 0) + (s.maxHp[id] ?? 0) * REST_HEAL_FRACTION;
    const cap = s.restCap[id] ?? 0;
    s.hp[id] = next > cap ? cap : next;
  }
}
