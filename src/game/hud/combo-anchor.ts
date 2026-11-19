import { COMBO_POP_SCALE, NUMBER_FAN, NUMBER_MARGIN, NUMBER_RISE_PX, NUMBER_TOP, clampNumber, type HudRect } from './arcade-hud';
import { arcadeHeroScale, visualBox, type Box } from '../views/hero-scale';

/**
 * Pure placement maths for the combo counter anchored over the victim (FR-1, combo-counter-anchoring). No Phaser, no imports of
 * `fx/defence-callouts` or `fx/pop-lanes` (those are lazy chunks; the overlap, lift, slide, drop, ease and ceiling helpers are
 * copied here and a test pins them to the originals). Everything is in HUD px unless it says world. The counter's box is
 * `w` x `h` (its unscaled text size) with its origin at bottom-centre, so the pop scale never feeds back into the placement.
 */

/** Gap (px) kept from every obstacle. */
export const COMBO_GAP = 8;
/** The natural spot must be clear this long before the counter eases back to it. */
export const COMBO_CLEAR_MS = 300;
/** Opacity cap of a counter that fits nowhere. */
export const COMBO_STUCK_ALPHA = 0.4;
/** A slide may go this far past the number lane's edge. */
export const COMBO_SLIDE_EXTRA = 40;
/** Damage-number lane: horizontal and upward fan reach (from NUMBER_FAN, in HUD px at s = 1) and half the width of one number. */
export const COMBO_FAN_X = Math.max(...NUMBER_FAN.map(([x]) => Math.abs(x)));
export const COMBO_FAN_UP = Math.max(...NUMBER_FAN.map(([, y]) => Math.abs(y)));
export const NUMBER_HALF_W = 35;
/** The tallest number is at least this high (the 38 px hit size). */
export const NUMBER_H_MIN = 38;
/** Gap (px) kept under a status chip or label. */
export const COMBO_CEIL_PAD = 4;
export const COMBO_SETTLE_PX = 0.5;
export const COMBO_EASE_TAU_MS = 35;
export const COMBO_POP_MAX = 1 + COMBO_POP_SCALE;
/** Lowest a counter's bottom may sit above the frame bottom (the action bar), as `clampNumber` has it. */
const BOTTOM_INSET = 88;

/** True on desktop pointers when the model has an anchor; everything else keeps the fixed slot. */
export const comboMode = (phoneHud: boolean, coarse: boolean, anchored: boolean): 'anchored' | 'band' =>
  !phoneHud && !coarse && anchored ? 'anchored' : 'band';

export interface VictimAnchor {
  headX: number;
  headY: number;
  laneX: number;
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/**
 * The victim's drawn head in WORLD px: `headX`/`headY` are the top centre of the visual box (the same box `character-view` draws),
 * `laneX` the sim-box centre where damage numbers spawn. `box` is a scratch box; `out` is filled and returned.
 */
export function victimAnchor(px: number, x: number, py: number, y: number, w: number, h: number, framePos: number, worldW: number, box: Box, out: VictimAnchor): VictimAnchor {
  const lx = lerp(px, x, framePos);
  const ly = lerp(py, y, framePos);
  const vb = visualBox(lx, ly, w, h, arcadeHeroScale(h), box, worldW);
  out.headX = vb.x + vb.w / 2;
  out.headY = vb.y;
  out.laneX = lx + w / 2;
  return out;
}

export interface NumberLane {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * The strip over the victim the damage numbers use, as a rect: `laneX` its centre, `headY` the head top (both HUD px), `s` the
 * HUD px per world px, `numberH` the tallest number so far. Writes and returns `out`.
 */
export function numberLane(laneX: number, headY: number, s: number, numberH: number, out: NumberLane): NumberLane {
  const half = COMBO_FAN_X * s + NUMBER_HALF_W;
  const top = Math.max(NUMBER_TOP, headY - (COMBO_FAN_UP * s + NUMBER_RISE_PX + numberH));
  const bottom = Math.max(headY, NUMBER_TOP + numberH);
  out.x = laneX - half;
  out.y = top;
  out.w = half * 2;
  out.h = Math.max(0, bottom - top);
  return out;
}

/** The HUD y a counter spanning HUD x `x0`..`x1` must stay below: `floor`, or under any rect (status chip, label) it would pass behind. */
export function comboCeil(rects: readonly HudRect[], count: number, x0: number, x1: number, floor = NUMBER_TOP, pad = COMBO_CEIL_PAD): number {
  let ceil = floor;
  for (let i = 0; i < count; i++) {
    const r = rects[i];
    if (r && x1 > r.x && x0 < r.x + r.w) ceil = Math.max(ceil, r.y + r.h + pad);
  }
  return ceil;
}

/** Copy of `calloutOverlaps`: the box (centre `cx`, bottom, `halfW` x `h`) grown by `gap` touches the rect. Exactly `gap` apart is clear. */
export function overlap(cx: number, bottom: number, halfW: number, h: number, r: HudRect, gap: number): boolean {
  return cx + halfW + gap > r.x && cx - halfW - gap < r.x + r.w && bottom + gap > r.y && bottom - h - gap < r.y + r.h;
}

export function overlapsAny(cx: number, bottom: number, halfW: number, h: number, rects: readonly HudRect[], count: number, gap: number): boolean {
  for (let i = 0; i < count; i++) if (overlap(cx, bottom, halfW, h, rects[i] as HudRect, gap)) return true;
  return false;
}

/** Copy of `clearAbove`: lifts `bottom` until the box clears the first `count` rects (bottom only moves up, `count + 1` passes settle it). */
export function lift(cx: number, bottom: number, halfW: number, h: number, rects: readonly HudRect[], count: number, gap: number): number {
  for (let pass = 0; pass <= count; pass++) {
    let moved = false;
    for (let i = 0; i < count; i++) {
      const r = rects[i] as HudRect;
      if (overlap(cx, bottom, halfW, h, r, gap)) {
        bottom = r.y - gap;
        moved = true;
      }
    }
    if (!moved) break;
  }
  return bottom;
}

/** Copy of `slideClear`: the x nearest `cx` beside every rect, within `[xLo + halfW, xHi - halfW]` and `maxSlide` of `anchorX`; ties go toward `centre`. */
export function slide(
  cx: number, bottom: number, halfW: number, h: number, rects: readonly HudRect[], count: number, gap: number,
  xLo: number, xHi: number, maxSlide: number, centre: number, anchorX: number,
): number {
  let best = cx;
  let bestD = Infinity;
  for (let i = 0; i < count; i++) {
    const r = rects[i] as HudRect;
    for (let side = 0; side < 2; side++) {
      const x = side === 0 ? r.x - gap - halfW : r.x + r.w + gap + halfW;
      if (x < xLo + halfW || x > xHi - halfW || Math.abs(x - anchorX) > maxSlide) continue;
      if (overlapsAny(x, bottom, halfW, h, rects, count, gap)) continue;
      const d = Math.abs(x - cx);
      if (d < bestD || (d === bestD && Math.abs(x - centre) < Math.abs(best - centre))) {
        best = x;
        bestD = d;
      }
    }
  }
  return best;
}

/** Copy of `dropBelow`: moves `bottom` down under the rects it overlaps, never lower than `maxBottom`. */
export function drop(cx: number, bottom: number, halfW: number, h: number, rects: readonly HudRect[], count: number, gap: number, maxBottom: number): number {
  for (let pass = 0; pass <= count; pass++) {
    let moved = false;
    for (let i = 0; i < count; i++) {
      const r = rects[i] as HudRect;
      if (!overlap(cx, bottom, halfW, h, r, gap)) continue;
      const nb = r.y + r.h + gap + h;
      if (nb > maxBottom) continue;
      bottom = nb;
      moved = true;
    }
    if (!moved) break;
  }
  return bottom;
}

/** Copy of `easeTo`: one frame of the ease from `shown` to `target` over `dtMs`; snaps when `snap` is set or the gap is under half a pixel. */
export function easeTo(shown: number, target: number, dtMs: number, snap: boolean): number {
  const d = target - shown;
  if (snap || Math.abs(d) < COMBO_SETTLE_PX) return target;
  return shown + d * (1 - Math.exp(-Math.max(0, dtMs) / COMBO_EASE_TAU_MS));
}

/**
 * The largest milestone-pop scale (1..COMBO_POP_MAX) the counter at centre `x`, bottom `b` (unscaled `w` x `h`) may use and still
 * stay under the ceiling (`ceil`, taken over the widest spread) and inside the frame margins.
 */
export function popCap(x: number, b: number, halfW: number, h: number, ceil: number, frame: HudRect): number {
  const up = h > 0 ? (b - ceil) / h : COMBO_POP_MAX;
  const left = halfW > 0 ? (x - frame.x - NUMBER_MARGIN) / halfW : COMBO_POP_MAX;
  const right = halfW > 0 ? (frame.x + frame.w - NUMBER_MARGIN - x) / halfW : COMBO_POP_MAX;
  return Math.max(1, Math.min(COMBO_POP_MAX, up, left, right));
}

/**
 * `cap` (>= 1) lowered so the popped counter (scaled about its bottom centre) still keeps `COMBO_GAP` from every obstacle; the
 * placement itself uses the unscaled box, so without this a pop shrinks the gap. 1 when it already touches (stuck included).
 */
export function obstacleCap(cx: number, bottom: number, halfW: number, h: number, rects: readonly HudRect[], count: number, cap: number): number {
  if (cap <= 1 || !overlapsAny(cx, bottom, halfW * cap, h * cap, rects, count, COMBO_GAP)) return cap;
  let lo = 1;
  let hi = cap;
  for (let n = 0; n < 12; n++) {
    const mid = (lo + hi) / 2;
    if (overlapsAny(cx, bottom, halfW * mid, h * mid, rects, count, COMBO_GAP)) hi = mid;
    else lo = mid;
  }
  return lo;
}

/** Per-team placement memory: the shown and target offsets from the natural spot, and how long the natural spot has been clear. */
export interface PlaceState {
  dx: number;
  dy: number;
  tx: number;
  ty: number;
  clearMs: number;
  placed: boolean;
}

export function newPlaceState(): PlaceState {
  return { dx: 0, dy: 0, tx: 0, ty: 0, clearMs: 0, placed: false };
}

export function resetPlaceState(s: PlaceState): void {
  s.dx = s.dy = s.tx = s.ty = s.clearMs = 0;
  s.placed = false;
}

export interface PlaceInput {
  /** Natural spot: the head's x and the bottom `COMBO_GAP` above the number lane. */
  headX: number;
  b0: number;
  /** Unscaled text size. */
  w: number;
  h: number;
  frame: HudRect;
  /** The HUD furniture the counter stays under (status chips, labels, bench chips), first `ceilCount` entries. */
  ceilRects: readonly HudRect[];
  ceilCount: number;
  /** What the counter stays clear of (pops, call-outs, the number lane, the other counter, the terrain badge), first `count` entries. */
  obstacles: readonly HudRect[];
  count: number;
  /** A new combo, a new victim or a first placement: jump instead of easing. */
  fresh: boolean;
  reduced: boolean;
  dtMs: number;
}

export interface PlaceOut {
  /** Centre x and bottom y to draw at (origin 0.5, 1). */
  x: number;
  y: number;
  /** Where the shown offsets are heading, as a centre/bottom. */
  targetX: number;
  targetY: number;
  /** Nothing fits: drawn at the natural spot at most `COMBO_STUCK_ALPHA`. */
  stuck: boolean;
  settled: boolean;
  /** The ceiling over the counter's x-range, and the pop cap at the shown spot. */
  ceil: number;
  popMax: number;
  maxSlide: number;
}

export function newPlaceOut(): PlaceOut {
  return { x: 0, y: 0, targetX: 0, targetY: 0, stuck: false, settled: true, ceil: NUMBER_TOP, popMax: 1, maxSlide: 0 };
}

/**
 * Places the counter: tries, in order, keeping a still-valid spot (reduced motion), the natural spot once clear, the last offsets,
 * a lift, a slide, a drop, and finally gives up (stuck). Eases toward the target, then clamps like a damage number.
 * `lane` is the number lane rect (already among `obstacles`), used only to bound a slide. Writes and returns `out`.
 */
export function placeCombo(st: PlaceState, i: PlaceInput, lane: HudRect, out: PlaceOut): PlaceOut {
  const halfW = i.w / 2;
  const h = i.h;
  const f = i.frame;
  const xLo = f.x + NUMBER_MARGIN;
  const xHi = f.x + f.w - NUMBER_MARGIN;
  const bMax = f.y + f.h - BOTTOM_INSET;
  const centre = f.x + f.w / 2;
  const ceilAt = (cx: number): number => comboCeil(i.ceilRects, i.ceilCount, cx - halfW, cx + halfW);
  const ok = (cx: number, b: number): boolean =>
    cx - halfW >= xLo - 1e-6 && cx + halfW <= xHi + 1e-6 && b <= bMax + 1e-6 && b - h >= ceilAt(cx) - 1e-6 && !overlapsAny(cx, b, halfW, h, i.obstacles, i.count, COMBO_GAP);
  const maxSlide = lane.w / 2 + COMBO_GAP + halfW + COMBO_SLIDE_EXTRA;
  out.maxSlide = maxSlide;
  const natural = ok(i.headX, i.b0);
  st.clearMs = natural ? st.clearMs + Math.max(0, i.dtMs) : 0;
  const fresh = i.fresh || !st.placed;
  let found = false as boolean;
  let tx = 0;
  let ty = 0;
  const take = (cx: number, b: number): boolean => {
    if (!ok(cx, b)) return false;
    tx = cx - i.headX;
    ty = b - i.b0;
    found = true;
    return true;
  };
  const withCeil = (cx: number, b: number): number => Math.max(b, ceilAt(cx) + h);
  const keep = !fresh && (i.reduced ? take(i.headX + st.dx, i.b0 + st.dy) : false);
  if (!keep && !((natural && (fresh || st.clearMs >= COMBO_CLEAR_MS)) && take(i.headX, i.b0)) && !(!fresh && take(i.headX + st.tx, i.b0 + st.ty))) {
    // Lift above what it overlaps, then keep under the ceiling.
    const lifted = withCeil(i.headX, lift(i.headX, i.b0, halfW, h, i.obstacles, i.count, COMBO_GAP));
    if (!take(i.headX, lifted)) {
      const slid = slide(i.headX, withCeil(i.headX, i.b0), halfW, h, i.obstacles, i.count, COMBO_GAP, xLo, xHi, maxSlide, centre, i.headX);
      const sb = withCeil(slid, lift(slid, withCeil(slid, i.b0), halfW, h, i.obstacles, i.count, COMBO_GAP));
      if (!take(slid, sb)) {
        const dropped = drop(i.headX, i.b0, halfW, h, i.obstacles, i.count, COMBO_GAP, i.b0);
        take(i.headX, dropped);
      }
    }
  }
  out.stuck = !found;
  if (!found) {
    tx = 0;
    ty = 0;
  }
  st.tx = tx;
  st.ty = ty;
  const snap = fresh || i.reduced;
  st.dx = easeTo(st.dx, tx, i.dtMs, snap);
  st.dy = easeTo(st.dy, ty, i.dtMs, snap);
  st.placed = true;
  out.targetX = i.headX + tx;
  out.targetY = i.b0 + ty;
  out.settled = Math.abs(st.dx - tx) < COMBO_SETTLE_PX && Math.abs(st.dy - ty) < COMBO_SETTLE_PX;
  // The hard limits: under the ceiling, then on screen like a damage number (no rects to avoid).
  const cx = i.headX + st.dx;
  const hard = clampNumber(cx, Math.max(i.b0 + st.dy, ceilAt(cx) + h), halfW, h, f, []);
  out.x = hard.x;
  out.y = hard.y;
  out.ceil = ceilAt(hard.x);
  const cap = popCap(hard.x, hard.y, halfW, h, comboCeil(i.ceilRects, i.ceilCount, hard.x - COMBO_POP_MAX * halfW, hard.x + COMBO_POP_MAX * halfW), f);
  out.popMax = obstacleCap(hard.x, hard.y, halfW, h, i.obstacles, i.count, cap);
  return out;
}
