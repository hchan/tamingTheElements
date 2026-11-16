// Depth step (WP P3D-1): a super or cast steps a hero "toward the camera" in the three-quarter arena. Screen y is floor depth, so the
// feet drop a few px, an unboxed rig grows a little about its feet (the dolly) and the contact shadow follows, grows and darkens.
// Pure view maths: no Phaser, no clock, no trig, no allocation per call.
import { clamp01, follow, type Pose } from './pose-math';

/** Uniform scale added at z = 1, unboxed rigs only; tune from screenshots (0.04-0.08). */
export const DOLLY_MAX = 0.06;
/** ADR-0020: portrait (boxed) rigs keep their painted size; they get the drop and the shadow only. */
/** Feet drop at z = 1, in body heights (about 5-6 px on a 160 px hero). */
export const DROP_K = 0.035;
/** Super hold: equals SUPER_FREEZE_TICKS * 20 ms (a test pins it). */
export const SUPER_Z = 1;
export const SUPER_HOLD_MS = 320;
/** Elemental cast and charge start. */
export const CAST_Z = 0.4;
export const CAST_HOLD_MS = 220;
/** Projectile casts: small, at most one pulse per gap. */
export const PROJ_CAST_Z = 0.25;
export const PROJ_CAST_GAP_MS = 400;
/** Fast in, slow out; no overshoot. */
export const TAU_IN_MS = 60;
export const TAU_OUT_MS = 140;
export const SHADOW_GROW = 0.1;
export const SHADOW_DARKEN = 0.2;
export const SHADOW_ALPHA_CAP = 0.7;

/** The depth the hero is heading for: 0 under reduced motion, the super while held, the cast level inside its window. */
export function depthTarget(superHeld: boolean, castAgeMs: number, castZ: number, reduced: boolean): number {
  if (reduced) return 0;
  if (superHeld) return SUPER_Z;
  return castAgeMs >= 0 && castAgeMs < CAST_HOLD_MS ? castZ : 0;
}

/** One frame of easing toward `target`; snaps tiny values to 0 so the pose is an exact identity again. */
export function stepDepth(z: number, target: number, dtMs: number): number {
  if (dtMs <= 0) return z;
  const n = clamp01(z + (target - z) * follow(dtMs, target > z ? TAU_IN_MS : TAU_OUT_MS));
  return n < 0.001 ? 0 : n;
}

/** Adds the drop (and the dolly for unboxed rigs) to the pose; returns the dolly used. z = 0 changes nothing. */
export function applyDepth(p: Pose, z: number, bh: number, boxed: boolean): number {
  if (z <= 0) return 1;
  p.oy += z * DROP_K * bh;
  if (boxed) return 1;
  const d = 1 + z * DOLLY_MAX;
  p.sx *= d;
  p.sy *= d;
  return d;
}

export interface ShadowPose {
  dx: number;
  dy: number;
  scaleMul: number;
  alphaMul: number;
}

/** The shadow follows the dropped feet, grows and darkens; fills and returns `out`. */
export function shadowFor(z: number, bh: number, out: ShadowPose): ShadowPose {
  out.dx = 0;
  out.dy = z * DROP_K * bh;
  out.scaleMul = 1 + z * SHADOW_GROW;
  out.alphaMul = 1 + z * SHADOW_DARKEN;
  return out;
}
