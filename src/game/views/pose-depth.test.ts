import { describe, expect, it } from 'vitest';
import {
  CAST_HOLD_MS, CAST_Z, DOLLY_MAX, DROP_K, SHADOW_DARKEN, SHADOW_GROW, SUPER_HOLD_MS, SUPER_Z, applyDepth, depthTarget, shadowFor, stepDepth,
  type ShadowPose,
} from './pose-depth';
import { resetPose } from './pose-math';

describe('depthTarget', () => {
  it('is 0 under reduced motion, the super level while held, the cast level inside its window, else 0', () => {
    expect(depthTarget(true, 0, CAST_Z, true)).toBe(0);
    expect(depthTarget(false, 0, CAST_Z, true)).toBe(0);
    expect(depthTarget(true, 5000, CAST_Z, false)).toBe(SUPER_Z);
    expect(depthTarget(false, 0, CAST_Z, false)).toBe(CAST_Z);
    expect(depthTarget(false, CAST_HOLD_MS - 1, CAST_Z, false)).toBe(CAST_Z);
    expect(depthTarget(false, CAST_HOLD_MS, CAST_Z, false)).toBe(0);
    expect(depthTarget(false, -5, CAST_Z, false)).toBe(0);
  });
  it('the super hold is the super freeze (16 ticks of 20 ms; core super.test pins the 16)', () => {
    expect(SUPER_HOLD_MS).toBe(16 * 20);
  });
});

describe('stepDepth', () => {
  it('leaves z unchanged for dt <= 0', () => {
    expect(stepDepth(0.5, 1, 0)).toBe(0.5);
    expect(stepDepth(0.5, 0, -3)).toBe(0.5);
  });
  it('rises faster than it falls', () => {
    const up = stepDepth(0, 1, 30);
    const down = 1 - stepDepth(1, 0, 30);
    expect(up).toBeGreaterThan(down);
  });
  it('clamps to 0..1 and snaps tiny values to 0', () => {
    expect(stepDepth(0.9999, 5, 1000)).toBeLessThanOrEqual(1);
    expect(stepDepth(0.0012, 0, 1000)).toBe(0);
    let z = 0.5;
    for (let i = 0; i < 400; i++) z = stepDepth(z, 0, 16.7);
    expect(z).toBe(0);
  });
  it('reaches 0.9 within about 200 ms at 16.7 ms steps', () => {
    let z = 0;
    let t = 0;
    while (z < 0.9 && t < 1000) {
      z = stepDepth(z, 1, 16.7);
      t += 16.7;
    }
    expect(t).toBeLessThanOrEqual(200);
  });
});

describe('applyDepth', () => {
  it('z = 0 is an exact identity', () => {
    const p = resetPose({ sx: 1, sy: 1, rot: 0, ox: 0, oy: 0, alpha: 1 });
    expect(applyDepth(p, 0, 160, false)).toBe(1);
    expect(p).toEqual({ sx: 1, sy: 1, rot: 0, ox: 0, oy: 0, alpha: 1 });
  });
  it('unboxed: dollies about the feet and drops them', () => {
    const p = resetPose({ sx: 1, sy: 1, rot: 0, ox: 0, oy: 0, alpha: 1 });
    expect(applyDepth(p, 1, 160, false)).toBeCloseTo(1 + DOLLY_MAX, 6);
    expect(p.sx).toBeCloseTo(1 + DOLLY_MAX, 6);
    expect(p.sy).toBeCloseTo(1 + DOLLY_MAX, 6);
    expect(p.oy).toBeCloseTo(DROP_K * 160, 6);
  });
  it('boxed (ADR-0020): no scale, the drop still applies, dolly reported as 1', () => {
    const p = resetPose({ sx: 1, sy: 1, rot: 0, ox: 0, oy: 0, alpha: 1 });
    expect(applyDepth(p, 1, 160, true)).toBe(1);
    expect(p.sx).toBe(1);
    expect(p.sy).toBe(1);
    expect(p.oy).toBeCloseTo(DROP_K * 160, 6);
  });
});

describe('shadowFor', () => {
  it('drops with the feet, grows and darkens, and reuses `out`', () => {
    const out: ShadowPose = { dx: 9, dy: 0, scaleMul: 1, alphaMul: 1 };
    const r = shadowFor(1, 100, out);
    expect(r).toBe(out);
    expect(out).toEqual({ dx: 0, dy: DROP_K * 100, scaleMul: 1 + SHADOW_GROW, alphaMul: 1 + SHADOW_DARKEN });
    shadowFor(0, 100, out);
    expect(out).toEqual({ dx: 0, dy: 0, scaleMul: 1, alphaMul: 1 });
  });
});
