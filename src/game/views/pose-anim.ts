/**
 * Pure transform helpers for the procedural character animation (view only, no Phaser, no clock, no sim state), composed
 * by `pose-math.ts` (`breathe`, `applyPose`), which are only reached when reduced motion is off. Triangle waves only,
 * so no trigonometry differs between engines.
 */

/** Idle bob period in ms and peak height in px; cast lunge distance in px; tag-in pop overshoot. */
export const BOB_MS = 1800;
export const BOB_PX = 1.2;
export const LUNGE_PX = 5;
export const POP_OVERSHOOT = 0.14;

/** Triangle wave 0..1..0 of `t` (period 1). */
export function tri(t: number): number {
  const u = t - Math.floor(t);
  return u < 0.5 ? u * 2 : 2 - u * 2;
}

/** Idle bob: vertical offset in px (negative is up) at animation clock `ms`, scaled by `amount` 0..1 (1 when standing). */
export function bobOffset(ms: number, amount: number): number {
  return -BOB_PX * tri(ms / BOB_MS) * amount;
}

/** Attack lunge: horizontal offset in px at progress `t` (0..1) of the cast pose, `dir` -1 or 1: out and back, peaking mid-pose. */
export function lungeOffset(t: number, dir: number): number {
  return dir * LUNGE_PX * tri(t);
}

/** Tag-in pop: scale multiplier at progress `t` (1 at the ends, a short overshoot between). */
export function popScale(t: number): number {
  return 1 + POP_OVERSHOOT * tri(t);
}
