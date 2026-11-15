import { DASH_CURVE_PM, DASH_TICKS, WALK_ACCEL_PM, WALK_BRAKE_PM, WALK_TURN_PM } from '../../../data/arcade';

/**
 * One tick of walk inertia on one axis (FUN-DESIGN 2.3a): moves `cur` towards `target` by `speed * pm / 1000`, with
 * WALK_TURN_PM when they point opposite ways, WALK_BRAKE_PM when `target` is smaller in size (release or slow-down)
 * and WALK_ACCEL_PM otherwise. Lands exactly on `target` when it is within one step. `speed` is the hero's walk speed.
 */
export function approachWalk(cur: number, target: number, speed: number): number {
  const pm = cur * target < 0 ? WALK_TURN_PM : Math.abs(target) < Math.abs(cur) ? WALK_BRAKE_PM : WALK_ACCEL_PM;
  const step = (speed * pm) / 1000;
  const d = target - cur;
  if (d > step) return cur + step;
  if (d < -step) return cur - step;
  return target;
}

/** Share (per mille) of the dash step on 1-based dash tick `tick`: DASH_CURVE_PM, 1000 outside 1..DASH_TICKS. */
export function dashCurvePm(tick: number): number {
  return tick >= 1 && tick <= DASH_TICKS ? (DASH_CURVE_PM[tick - 1] ?? 1000) : 1000;
}
