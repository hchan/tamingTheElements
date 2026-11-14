/**
 * Lane stagger for the floating call-outs over a fighter (qa-r29: ROOTED, FREE, COUNTER, HEAL, SNAG and the damage numbers
 * all started on the same spot and read as one smear). A new pop lifts by one lane for each pop still live near it. Pure.
 */
export const POP_LANE_PX = 22;
/** Two pops are "near" when their anchors are within this box (px). */
export const POP_NEAR_X = 110;
export const POP_NEAR_Y = 70;
/** At most this many lanes (a fourth pop reuses the top lane rather than leaving the screen). */
export const POP_MAX_LANES = 3;

export interface LivePop {
  readonly x: number;
  readonly y: number;
}

/** The extra lift (px, >= 0) for a pop starting at (`x`, `y`) while `live` pops are up. */
export function popLaneLift(live: readonly LivePop[], x: number, y: number): number {
  let n = 0;
  for (const p of live) if (Math.abs(p.x - x) < POP_NEAR_X && Math.abs(p.y - y) < POP_NEAR_Y) n++;
  return Math.min(n, POP_MAX_LANES) * POP_LANE_PX;
}
