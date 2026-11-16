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

/**
 * A call-out over the fighter that was hit (ROOTED, FREE, COUNTER) starts this far above the spot of the damage number
 * (qa-r49: the number sat on the word and hid its middle letters, so "ROOTED" read as "RO..D"). One number's height (38) plus its rise (24) plus a gap (4), so BLOCK and PARRY clear the number as it floats.
 */
export const POP_NUMBER_CLEAR_PX = 66;

/** The lowest HUD y a floating call-out may reach: the bottom of the dark scrim (SCRIM_BOTTOM in slim-hud; a test pins it). */
export const POP_CEIL_FLOOR = 102;
/** Gap (px) kept under a status chip. */
export const POP_CEIL_PAD = 4;

interface RectLike {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/**
 * The HUD y a pop spanning HUD x `x0`..`x1` must stay below: the scrim bottom, or under any status chip it would pass behind
 * (qa-r75: SNAG half hidden by the SNAGGED / STUN chips). `rects` holds one array of chip rects per team.
 */
export function popCeil(rects: readonly (readonly RectLike[])[] | undefined, x0: number, x1: number, floor = POP_CEIL_FLOOR, pad = POP_CEIL_PAD): number {
  let ceil = floor;
  if (!rects) return ceil;
  for (const team of rects) for (const r of team) if (x1 > r.x && x0 < r.x + r.w) ceil = Math.max(ceil, r.y + r.h + pad);
  return ceil;
}

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
