/**
 * Pure placement maths for the Arcade call-outs (ROOTED, CHARGE!, PARRY ...) so they stay clear of the white damage pops.
 * No imports and no allocation: `defence-view` calls these every frame. Call-outs are boxes centred on `cx` whose bottom edge
 * is `bottom` (the label's origin is bottom-centre), `halfW` wide each side and `h` tall; pops are world-px rects. The name
 * starts with `defence-` so the build keeps it in the `defence-view` chunk (vite.config.ts), out of Classic.
 */

/** A rectangle in px; structurally the same as the HUD's `HudRect`. */
export interface Box { x: number; y: number; w: number; h: number }

/** True when the call-out (grown by `gap` on every side) touches the rect. Exactly `gap` apart is not an overlap. */
export function calloutOverlaps(cx: number, bottom: number, halfW: number, h: number, r: Box, gap: number): boolean {
  return cx + halfW + gap > r.x && cx - halfW - gap < r.x + r.w && bottom + gap > r.y && bottom - h - gap < r.y + r.h;
}

export function overlapsAny(cx: number, bottom: number, halfW: number, h: number, rects: readonly Box[], gap: number): boolean {
  for (let i = 0; i < rects.length; i++) if (calloutOverlaps(cx, bottom, halfW, h, (rects[i] as Box), gap)) return true;
  return false;
}

/**
 * Lifts `bottom` until the call-out clears every rect: on an overlap it moves to `r.y - gap` and rescans. Bottom only ever
 * moves up the screen, so each rect can trigger at most once and `rects.length + 1` passes always settle it.
 */
export function clearAbove(cx: number, bottom: number, halfW: number, h: number, rects: readonly Box[], gap: number): number {
  for (let pass = 0; pass <= rects.length; pass++) {
    let moved = false;
    for (let i = 0; i < rects.length; i++) {
      const r = (rects[i] as Box);
      if (calloutOverlaps(cx, bottom, halfW, h, r, gap)) {
        bottom = r.y - gap;
        moved = true;
      }
    }
    if (!moved) break;
  }
  return bottom;
}

/**
 * The x nearest `cx` that puts the call-out beside every rect instead of over it: candidates sit `gap` off either side of a rect,
 * must stay inside `[xLo + halfW, xHi - halfW]`, within `maxSlide` of `anchorX` (the spawn x, so slides never add up) and clear of
 * all rects. Ties go toward `centre`. Returns `cx` when nothing fits.
 */
export function slideClear(
  cx: number, bottom: number, halfW: number, h: number, rects: readonly Box[], gap: number,
  xLo: number, xHi: number, maxSlide: number, centre: number, anchorX: number,
): number {
  let best = cx;
  let bestD = Infinity;
  for (let i = 0; i < rects.length; i++) {
    const r = (rects[i] as Box);
    for (let side = 0; side < 2; side++) {
      const x = side === 0 ? r.x - gap - halfW : r.x + r.w + gap + halfW;
      if (x < xLo + halfW || x > xHi - halfW || Math.abs(x - anchorX) > maxSlide) continue;
      if (overlapsAny(x, bottom, halfW, h, rects, gap)) continue;
      const d = Math.abs(x - cx);
      if (d < bestD || (d === bestD && Math.abs(x - centre) < Math.abs(best - centre))) {
        best = x;
        bestD = d;
      }
    }
  }
  return best;
}
