/**
 * Read-only accessors over the raw `SimState.arcade` block, shared by the agent observation (agents/observation.ts) and the
 * render view (sim/view.ts) so the base/stride math lives in one place. Never write through these; they only decode.
 */
import { ARCADE_E, ARCADE_WORLD_BASE, HAZARD_BASE, TRAP_STRIDE, TRAP_TABLE } from './state';
import type { SimState } from './state';

/** Per-entity Arcade field `field` of entity `id` (0 when out of range). */
export function arcadeE(s: SimState, id: number, field: number): number {
  return s.arcade[id * ARCADE_E + field] ?? 0;
}

/** Ticks left until the per-entity deadline `field` of entity `id`, at game tick `g` (floored at 0). */
export function arcadeLeft(s: SimState, id: number, field: number, g: number): number {
  return Math.max(0, arcadeE(s, id, field) - g);
}

/** Field `f` of world trap-table slot `slot`. */
export function trapField(s: SimState, slot: number, f: number): number {
  return s.arcade[ARCADE_WORLD_BASE + TRAP_TABLE + slot * TRAP_STRIDE + f] ?? 0;
}

/** Field `f` of the world stage hazard. */
export function hazardField(s: SimState, f: number): number {
  return s.arcade[ARCADE_WORLD_BASE + HAZARD_BASE + f] ?? 0;
}
