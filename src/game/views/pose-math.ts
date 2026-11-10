/**
 * Pure maths of the procedural pose layer (WP-arcade-pose-layer, FUN-DESIGN 2.16 step 1). No Phaser, no DOM, no clock:
 * everything is a function of its arguments so it is unit-tested in Node at any simulated display refresh rate.
 */

/** Pixels walked per walk-cycle frame: the old fixed 8 fps (6 ticks per frame) at the base speed of 5 px per tick. */
export const STRIDE_PX = 30;
/** A per-frame jump larger than this is a placement or a tag-in, not a walk: it moves no feet. */
export const TELEPORT_PX = 90;
/** Under this many px per second a character counts as standing. */
export const STAND_SPEED = 20;
/** Largest frame time the layer integrates, so a stalled tab cannot fling an animation to its end state. */
export const MAX_DT_MS = 100;

/** Walk-cycle frame for a distance `phase` walked (px): one frame per `STRIDE_PX`, looping over `count` frames. */
export function walkFrame(phase: number, count: number): number {
  return count <= 0 ? 0 : Math.floor(phase / STRIDE_PX) % count;
}

/** Signed shortest rotation from `from` to `to` in degrees, in [-180, 180). */
export function shortestArc(from: number, to: number): number {
  return ((((to - from) % 360) + 540) % 360) - 180;
}

/** `from` turned towards `to` by `t` (0..1) along the shortest arc; the result is not wrapped, so it stays continuous. */
export function lerpAngle(from: number, to: number, t: number): number {
  return from + shortestArc(from, to) * t;
}

/** Frame-rate independent exponential approach: the share of the remaining distance covered in `dtMs` with time constant `tauMs`. */
export function follow(dtMs: number, tauMs: number): number {
  return 1 - Math.exp(-dtMs / tauMs);
}

export function clamp01(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

export function easeOutCubic(t: number): number {
  const u = 1 - clamp01(t);
  return 1 - u * u * u;
}

export function easeOutBack(t: number): number {
  const u = clamp01(t) - 1;
  return 1 + 2.70158 * u * u * u + 1.70158 * u * u;
}

/** Dir8 (0 east, then counter-clockwise on screen) of a displacement; screen y grows downwards. -1 for none. */
export function headingOf(dx: number, dy: number): number {
  const sx = dx > 0 ? 1 : dx < 0 ? -1 : 0;
  const sy = dy > 0 ? 1 : dy < 0 ? -1 : 0;
  return HEADINGS[(sy + 1) * 3 + sx + 1] ?? -1;
}
/** Rows: up (north), level, down (south); columns: west, none, east. */
const HEADINGS = [3, 2, 1, 4, -1, 0, 5, 6, 7] as const;

/** Lean in degrees (clockwise positive) of a character heading `dir8`: sideways 4, diagonals 7, vertical none. */
export function leanFor(dir8: number): number {
  switch (dir8) {
    case 0: return 4;
    case 4: return -4;
    case 1: case 7: return 7;
    case 3: case 5: return -7;
    default: return 0;
  }
}

/** One pose evaluation: scale multipliers, rotation (degrees) and offsets (px) about the feet, an alpha multiplier. */
export interface Pose {
  sx: number;
  sy: number;
  rot: number;
  ox: number;
  oy: number;
  alpha: number;
}

export function resetPose(p: Pose): Pose {
  p.sx = 1;
  p.sy = 1;
  p.rot = 0;
  p.ox = 0;
  p.oy = 0;
  p.alpha = 1;
  return p;
}

/** Transient poses a sim event can trigger (the others, walking, idling and guarding, are continuous states). */
export const PoseKind = { none: 0, cast: 1, hurt: 2, dash: 3, tagIn: 4, victory: 5 } as const;
export type PoseKindValue = (typeof PoseKind)[keyof typeof PoseKind];

/** Length of each transient pose in ms (indexed by `PoseKind`). */
export const POSE_MS: readonly number[] = [0, 220, 300, 200, 320, 900];

/**
 * Adds transient pose `kind` at age `ageMs` into `p`. `dir` is -1 or 1 (the way the character faces or is pushed),
 * `power` 0..1 scales hurt by hit strength. Reduced motion keeps only what carries information: no movement, scale or
 * spin; a tag-in fades in instead of sliding.
 */
export function applyPose(p: Pose, kind: number, ageMs: number, dir: number, power: number, reduced: boolean): void {
  const dur = POSE_MS[kind] ?? 0;
  if (kind === PoseKind.none || dur <= 0 || ageMs >= dur) return;
  const t = ageMs / dur;
  if (kind === PoseKind.tagIn) {
    p.alpha *= easeOutCubic(t);
    if (!reduced) p.ox += -dir * 48 * (1 - easeOutCubic(t));
    return;
  }
  if (reduced) return;
  const bell = Math.sin(Math.PI * t);
  switch (kind) {
    case PoseKind.cast: {
      // Wind-up squash for the first third, then a stretch that settles: reads as a throw even from the spawn tick.
      const sq = t < 0.33 ? 0.1 * easeOutCubic(t / 0.33) : -0.12 * (1 - easeOutCubic((t - 0.33) / 0.67));
      p.sy *= 1 - sq;
      p.sx *= 1 + sq * 0.8;
      p.rot += dir * 3 * bell;
      break;
    }
    case PoseKind.hurt: {
      const s = 0.6 + 0.4 * power;
      p.rot += -dir * 14 * s * (1 - easeOutCubic(t)) * Math.min(1, t * 8);
      p.sy *= 1 - 0.1 * s * bell;
      p.sx *= 1 + 0.08 * s * bell;
      p.ox += -dir * 4 * s * (1 - t);
      break;
    }
    case PoseKind.dash:
      p.sx *= 1 + 0.25 * bell;
      p.sy *= 1 - 0.14 * bell;
      p.rot += dir * 5 * bell;
      break;
    case PoseKind.victory: {
      // Two hops, each a parabola, with a squash on landing.
      const h = (t * 2) % 1;
      p.oy -= 4 * 18 * h * (1 - h);
      p.sy *= 1 + 0.08 * Math.sin(Math.PI * h);
      break;
    }
    default:
  }
}

/** KO fall: rotation (degrees, towards `dir`), downward offset and alpha at progress `t` of the fall. */
export function koFall(p: Pose, t: number, dir: number, reduced: boolean): void {
  const e = easeOutCubic(t);
  p.alpha = t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4;
  if (reduced) return;
  p.rot = dir * 80 * e;
  p.oy = 14 * e;
}

/** Idle breathing: a slow vertical scale wave, `amount` 0..1 (1 when standing), `ms` the animation clock. */
export function breathe(p: Pose, ms: number, amount: number): void {
  const w = Math.sin((ms * 2 * Math.PI) / 2400) * 0.014 * amount;
  p.sy *= 1 + w;
  p.sx *= 1 - w * 0.5;
}
