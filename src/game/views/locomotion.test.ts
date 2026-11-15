import { describe, expect, it } from 'vitest';
import { FLAP_LIFT_PX, FLAP_MS, KNEE_DIP_PX, STEP_PX, applyLocomotion, flapPhase, kneeBend, locomotionOf } from './locomotion';
import { resetPose, type Pose } from './pose-math';

const fresh = (): Pose => resetPose({ sx: 1, sy: 1, rot: 0, ox: 0, oy: 0, alpha: 1 });
const WINGS = { wings: true, legs: false };
const LEGS = { wings: false, legs: true };

describe('locomotion flags', () => {
  it('flags the winged and legged heroes and nothing else', () => {
    expect(locomotionOf('sindarosa')).toEqual(WINGS);
    expect(locomotionOf('pax').legs).toBe(true);
    expect(locomotionOf('treenoc').legs).toBe(true);
    expect(locomotionOf('echo')).toEqual({ wings: false, legs: false });
    expect(locomotionOf('nope')).toEqual({ wings: false, legs: false });
  });
});

describe('wing flap', () => {
  it('beats with the period FLAP_MS between 0 and 1', () => {
    expect(flapPhase(0)).toBe(0);
    expect(flapPhase(FLAP_MS / 2)).toBe(1);
    expect(flapPhase(FLAP_MS)).toBeCloseTo(0, 9);
  });
  it('lifts at the top of the stroke and moves with the walk amount', () => {
    const p = fresh();
    applyLocomotion(p, WINGS, 1, 0, FLAP_MS / 2, false);
    expect(p.oy).toBeCloseTo(-FLAP_LIFT_PX, 9);
    expect(p.sx).toBeGreaterThan(1);
    const q = fresh();
    applyLocomotion(q, WINGS, 0.5, 0, FLAP_MS / 2, false);
    expect(q.oy).toBeCloseTo(-FLAP_LIFT_PX / 2, 9);
  });
  it('actually changes over time while moving', () => {
    const ys = new Set<number>();
    for (let ms = 0; ms < FLAP_MS; ms += 30) { const p = fresh(); applyLocomotion(p, WINGS, 1, 0, ms, false); ys.add(Math.round(p.oy * 100)); }
    expect(ys.size).toBeGreaterThan(3);
  });
});

describe('knee bend', () => {
  it('is deepest at foot contact and straight mid-step, repeating every step', () => {
    expect(kneeBend(0)).toBe(1);
    expect(kneeBend(STEP_PX / 2)).toBe(0);
    expect(kneeBend(STEP_PX)).toBeCloseTo(1, 9);
  });
  it('dips and squashes at contact, and stands tall mid-step', () => {
    const p = fresh();
    applyLocomotion(p, LEGS, 1, 0, 0, false);
    expect(p.oy).toBeCloseTo(KNEE_DIP_PX, 9);
    expect(p.sy).toBeLessThan(1);
    const q = fresh();
    applyLocomotion(q, LEGS, 1, STEP_PX / 2, 0, false);
    expect(q.oy).toBeCloseTo(0, 9);
    expect(q.sy).toBeCloseTo(1, 9);
  });
});

describe('steady states', () => {
  it('adds nothing under reduced motion or when standing', () => {
    for (const flags of [WINGS, LEGS, { wings: true, legs: true }]) {
      for (const [move, reduced] of [[1, true], [0, false]] as const) {
        const p = fresh();
        applyLocomotion(p, flags, move, 13, 77, reduced);
        expect(p).toEqual(fresh());
      }
    }
  });
  it('leaves an unflagged hero alone', () => {
    const p = fresh();
    applyLocomotion(p, locomotionOf('echo'), 1, 13, 77, false);
    expect(p).toEqual(fresh());
  });
});
