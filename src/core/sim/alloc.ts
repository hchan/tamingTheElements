import { now } from './clock';
import { ABIL_STRIDE, ARCADE_E, EntityFlag, F64_FIELDS, I32_FIELDS, MAX_ENTITIES, STATUS_SLOTS, STATUS_STRIDE, World, type SimState } from './state';

function clearSlot(s: SimState, id: number): void {
  for (const f of F64_FIELDS) s[f][id] = 0;
  for (const f of I32_FIELDS) s[f][id] = 0;
  const per = STATUS_SLOTS * STATUS_STRIDE;
  s.status.fill(0, id * per, (id + 1) * per);
  s.abil.fill(0, id * ABIL_STRIDE, (id + 1) * ABIL_STRIDE);
  if (s.arcade.length > 0) s.arcade.fill(0, id * ARCADE_E, (id + 1) * ARCADE_E);
}

/**
 * Allocates the lowest free entity id (a slot whose alive flag is clear), zeroes its
 * fields, marks it alive and returns the id. Returns -1 when full. The free set is
 * derived from the alive flags, so it is part of the snapshot with no extra state.
 */
export function allocEntity(s: SimState): number {
  for (let id = 0; id < MAX_ENTITIES; id++) {
    if (!isAlive(s, id)) {
      clearSlot(s, id);
      s.flags[id] = EntityFlag.alive;
      s.spawnTick[id] = now(s);
      s.world[World.nextId] = (s.world[World.nextId] ?? 0) + 1;
      return id;
    }
  }
  return -1;
}

/** Frees an entity, clearing every field and its status slots so stale data never reaches the hash. */
export function freeEntity(s: SimState, id: number): void {
  if (id < 0 || id >= MAX_ENTITIES || !isAlive(s, id)) return;
  clearSlot(s, id);
}

export function isAlive(s: SimState, id: number): boolean {
  return ((s.flags[id] ?? 0) & EntityFlag.alive) !== 0;
}

/** Live entity ids in ascending order. */
export function liveIds(s: SimState): number[] {
  const out: number[] = [];
  for (let id = 0; id < MAX_ENTITIES; id++) if (isAlive(s, id)) out.push(id);
  return out;
}
