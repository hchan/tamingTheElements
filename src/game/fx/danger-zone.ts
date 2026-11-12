/**
 * Pure helpers of the melee danger-zone outline (ability-telegraphs, first slice): a dashed outline with corner brackets drawn
 * on the TRUE hit box of every melee ability (Ice Shock, Ground Shock, Hurricane, Entangling Vines, Steal Health, Strangling
 * Branches), because the art is often smaller or fainter than the box (docs/ABILITY-AUDIT.md). The sim hits one tick after a
 * cast, so this marks the zone while it is live rather than before it. No Phaser, so danger-zone.test.ts covers it. It is
 * never colour alone: the outline is a dashed black-and-white pair (reads on any floor) with brackets at the corners.
 */

/** Ticks (20 ms each) of the strong "just cast" phase. */
export const DANGER_FLASH_TICKS = 12;
/** Alpha once the strong phase is over. */
export const DANGER_STEADY_ALPHA = 0.55;
export const DASH_PX = 14;
export const GAP_PX = 8;
export const BRACKET_PX = 22;

/** Outline alpha by age in ticks. Normal motion: bright and pulsing for the first DANGER_FLASH_TICKS, then steady. Reduced: steady. */
export function dangerAlpha(age: number, reduced: boolean): number {
  if (reduced || age >= DANGER_FLASH_TICKS) return DANGER_STEADY_ALPHA;
  return Math.floor(age / 3) % 2 === 0 ? 1 : 0.7;
}

/** The dashes along one axis-aligned edge from (x, y) of length `len`, as [x0, y0, x1, y1] (horizontal when `horizontal`). */
export function dashEdge(x: number, y: number, len: number, horizontal: boolean): number[][] {
  const out: number[][] = [];
  for (let d = 0; d < len; d += DASH_PX + GAP_PX) {
    const e = Math.min(d + DASH_PX, len);
    out.push(horizontal ? [x + d, y, x + e, y] : [x, y + d, x, y + e]);
  }
  return out;
}

/** All dashes around a box (top, bottom, left, right). */
export function dashBox(x: number, y: number, w: number, h: number): number[][] {
  return [...dashEdge(x, y, w, true), ...dashEdge(x, y + h, w, true), ...dashEdge(x, y, h, false), ...dashEdge(x + w, y, h, false)];
}

/** Bracket length for a box: at most BRACKET_PX and at most a third of the shorter side. */
export function bracketLen(w: number, h: number): number {
  return Math.max(4, Math.min(BRACKET_PX, Math.min(w, h) / 3));
}
