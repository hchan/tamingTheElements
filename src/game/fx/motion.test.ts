import { describe, expect, it } from 'vitest';
import { REDUCED_FADE_MS, classicWeightFor, holdFramesFor, planTween, shakeFor } from './motion';

describe('planTween', () => {
  it('animates everything with normal motion', () => {
    const to = { alpha: 0, spin: 360, x: 10 };
    expect(planTween(to, 1000, false)).toEqual({ instant: {}, animated: to, ms: 1000 });
  });
  it('drops spins, snaps geometry and cross-fades alpha under reduced motion', () => {
    const p = planTween({ alpha: 0, spin: 360, x: 10, w: 5 }, 1000, true);
    expect(p.instant).toEqual({ x: 10, w: 5 });
    expect(p.animated).toEqual({ alpha: 0 });
    expect(p.ms).toBe(REDUCED_FADE_MS);
  });
  it('a pure spin or move becomes instant with nothing animated', () => {
    const p = planTween({ spin: 720, y: 3 }, 400, true);
    expect(p.instant).toEqual({ y: 3 });
    expect(p.animated).toBeNull();
  });
  it('never lengthens a short fade', () => {
    expect(planTween({ alpha: 1 }, 50, true).ms).toBe(50);
  });
});

describe('shakeFor', () => {
  it('passes the shake through or drops it', () => {
    expect(shakeFor(80, 0.002, false)).toEqual({ durationMs: 80, intensity: 0.002 });
    expect(shakeFor(80, 0.002, true)).toBeNull();
  });
});

describe('holdFramesFor (view-only hit-stop)', () => {
  it('holds nothing on light hits and longer on heavier ones', () => {
    expect([0, 1, 2, 3, Number.NaN].map(holdFramesFor)).toEqual([0, 0, 2, 4, 0]);
    expect([5, 9, 10, 14, 15, 40].map(classicWeightFor)).toEqual([0, 0, 2, 2, 3, 3]);
  });
});
