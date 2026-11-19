/**
 * Lane stagger for the floating call-outs over a fighter (qa-r29: ROOTED, FREE, COUNTER, HEAL, SNAG and the damage numbers
 * all started on the same spot and read as one smear). A new pop takes the lowest lane no live pop near it occupies. Pure.
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
  /** Where the pop is drawn from; its lane lift (below) is taken off this when given. */
  readonly y: number;
  /** Extra lift (px) the pop already has on top of `y`, for callers that keep the base y apart. */
  readonly lift?: number;
}

/**
 * The extra lift (px, >= 0) for a pop starting at (`x`, `y`) while `live` pops are up: the lowest free lane (0..POP_MAX_LANES),
 * where a lane is taken when a nearby live pop is drawn within half a lane of it (a lane freed under a live pop is reused).
 * With every lane taken the pop goes to the top lane.
 */
export function popLaneLift(live: readonly LivePop[], x: number, y: number): number {
  for (let lane = 0; lane < POP_MAX_LANES; lane++) {
    const ly = y - lane * POP_LANE_PX;
    let taken = false;
    for (const p of live) {
      const py = p.y - (p.lift ?? 0);
      if (Math.abs(p.x - x) < POP_NEAR_X && Math.abs(py - y) < POP_NEAR_Y && Math.abs(py - ly) < POP_LANE_PX / 2) {
        taken = true;
        break;
      }
    }
    if (!taken) return lane * POP_LANE_PX;
  }
  return POP_MAX_LANES * POP_LANE_PX;
}

/**
 * The top y (HUD px) for a plate `h` tall spanning HUD x `x0`..`x1` that wants to sit at `top` but must not overlap a status chip
 * (qa-r110: the weather badge hid the "GALE +20%" chip when the chips wrapped to a second row). It slides down under any chip it
 * touches, repeating until clear (chips only ever push it down), and keeps `pad` from each. `rects` holds one array per team.
 */
export function clearOfChips(rects: readonly (readonly RectLike[])[] | undefined, x0: number, x1: number, top: number, h: number, pad = POP_CEIL_PAD): number {
  if (!rects) return top;
  for (let pass = 0; pass < 8; pass++) {
    let moved = false;
    for (const team of rects) {
      for (const r of team) {
        if (x1 > r.x - pad && x0 < r.x + r.w + pad && top < r.y + r.h + pad && top + h > r.y - pad) {
          top = r.y + r.h + pad;
          moved = true;
        }
      }
    }
    if (!moved) break;
  }
  return top;
}
