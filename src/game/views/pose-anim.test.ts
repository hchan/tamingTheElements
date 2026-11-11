import { describe, expect, it } from 'vitest';
import { BOB_MS, BOB_PX, LUNGE_PX, POP_OVERSHOOT, bobOffset, lungeOffset, popScale, tri } from './pose-anim';
import { POSE_MS, PoseKind, applyPose, breathe, resetPose, type Pose } from './pose-math';

const fresh = (): Pose => resetPose({ sx: 1, sy: 1, rot: 0, ox: 0, oy: 0, alpha: 1 });

describe('pose-anim', () => {
  it('tri is a 0..1..0 wave', () => {
    expect(tri(0)).toBe(0);
    expect(tri(0.5)).toBe(1);
    expect(tri(1)).toBe(0);
    expect(tri(0.25)).toBe(0.5);
  });

  it('idle bob stays within its band, is periodic and scales with how still the character is', () => {
    for (let ms = 0; ms < 2 * BOB_MS; ms += 37) {
      const y = bobOffset(ms, 1);
      expect(y).toBeLessThanOrEqual(0);
      expect(y).toBeGreaterThanOrEqual(-BOB_PX - 1e-9);
      expect(bobOffset(ms + BOB_MS, 1)).toBeCloseTo(y, 9);
    }
    expect(bobOffset(BOB_MS / 2, 1)).toBeCloseTo(-BOB_PX, 9);
    expect(bobOffset(BOB_MS / 2, 0)).toBeCloseTo(0, 9);
    expect(bobOffset(BOB_MS / 2, 0.5)).toBeCloseTo(-BOB_PX / 2, 9);
  });

  it('lunge goes out towards the facing then returns, mirrored by dir', () => {
    expect(lungeOffset(0, 1)).toBe(0);
    expect(lungeOffset(0.5, 1)).toBeCloseTo(LUNGE_PX, 9);
    expect(lungeOffset(0.5, -1)).toBeCloseTo(-LUNGE_PX, 9);
    expect(lungeOffset(1, 1)).toBeCloseTo(0, 9);
    expect(lungeOffset(0.2, 1)).toBeLessThan(lungeOffset(0.5, 1));
  });

  it('tag-in pop overshoots then settles to 1', () => {
    expect(popScale(0)).toBe(1);
    expect(popScale(1)).toBe(1);
    let max = 1;
    for (let t = 0.01; t < 1; t += 0.01) max = Math.max(max, popScale(t));
    expect(max).toBeGreaterThan(1.1);
    expect(max).toBeLessThanOrEqual(1 + POP_OVERSHOOT);
  });

  it('applyPose adds the lunge and pop; reduced motion adds neither', () => {
    const cast = fresh();
    applyPose(cast, PoseKind.cast, (POSE_MS[PoseKind.cast] ?? 0) * 0.5, 1, 1, false);
    expect(cast.ox).toBeCloseTo(LUNGE_PX, 6);
    const calm = fresh();
    applyPose(calm, PoseKind.cast, (POSE_MS[PoseKind.cast] ?? 0) * 0.5, 1, 1, true);
    expect(calm).toEqual(fresh());
    const tag = fresh();
    applyPose(tag, PoseKind.tagIn, (POSE_MS[PoseKind.tagIn] ?? 0) * 0.3, 1, 0, false);
    expect(tag.sx).toBeGreaterThan(1);
    const tagReduced = fresh();
    applyPose(tagReduced, PoseKind.tagIn, (POSE_MS[PoseKind.tagIn] ?? 0) * 0.3, 1, 0, true);
    expect(tagReduced.sx).toBe(1);
    expect(tagReduced.ox).toBe(0);
  });

  it('breathe adds the idle bob', () => {
    const p = fresh();
    breathe(p, BOB_MS / 2, 1);
    expect(p.oy).toBeCloseTo(-BOB_PX, 6);
  });
});
