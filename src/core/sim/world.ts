import type { Aabb } from '../math/aabb';
import { createSimState, type SimState } from './state';

/** Default arena in px (legacy size depends on the window; this is a fixed stand-in). */
export const DEFAULT_ARENA: Aabb = { x: 0, y: 100, w: 1280, h: 620 };

export interface SimWorld {
  readonly state: SimState;
  /** Walkable area; leaving it counts as hitting a legacy `Solid` wall. */
  readonly arena: Aabb;
}

/** `arcade` allocates the Arcade state block (rulesetArcade on); Classic leaves it empty. */
export function createWorld(matchSeed = 0, arena: Aabb = DEFAULT_ARENA, arcade = false): SimWorld {
  return { state: createSimState(matchSeed, arcade), arena };
}
