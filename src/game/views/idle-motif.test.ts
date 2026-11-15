import { describe, expect, it } from 'vitest';
import type { IdleMotifKind } from '../platform/idle-look';
import { MOTIF_MAX_OY_PX, MOTIF_MAX_ROT_DEG, MOTIF_MIN_ALPHA, MOTIF_MS, applyIdleMotif, wave } from './idle-motif';
import { resetPose, type Pose } from './pose-math';

const KINDS: IdleMotifKind[] = ['hover', 'heave', 'wingFlex', 'sway', 'wobble', 'pulse'];
const fresh = (): Pose => resetPose({ sx: 1, sy: 1, rot: 0, ox: 0, oy: 0, alpha: 1 });

describe('wave', () => {
  it('stays in -1..1 and is periodic', () => {
    for (let t = -2; t < 3; t += 0.037) {
      expect(wave(t)).toBeGreaterThanOrEqual(-1);
      expect(wave(t)).toBeLessThanOrEqual(1);
      expect(wave(t + 1)).toBeCloseTo(wave(t), 9);
    }
  });
});

describe('applyIdleMotif amplitude bounds', () => {
  it('rotation, lift and alpha stay inside the bounds for every motif over a full period', () => {
    for (const kind of KINDS) {
      for (const boxed of [false, true]) {
        for (let ms = 0; ms < MOTIF_MS[kind] * 2; ms += 17) {
          const p = fresh();
          applyIdleMotif(p, kind, ms, 1, false, boxed);
          expect(Math.abs(p.rot), kind).toBeLessThanOrEqual(MOTIF_MAX_ROT_DEG);
          expect(Math.abs(p.oy), kind).toBeLessThanOrEqual(MOTIF_MAX_OY_PX);
          expect(p.alpha, kind).toBeGreaterThanOrEqual(MOTIF_MIN_ALPHA);
          expect(p.alpha, kind).toBeLessThanOrEqual(1);
          expect(Math.abs(p.ox), kind).toBe(0);
        }
      }
    }
  });
  it('does something visible for each motif', () => {
    for (const kind of KINDS) {
      let moved = false;
      for (let ms = 0; ms < MOTIF_MS[kind]; ms += 50) {
        const p = fresh();
        applyIdleMotif(p, kind, ms, 1, false, false);
        if (p.rot !== 0 || p.oy !== 0 || p.alpha !== 1 || p.sx !== 1 || p.sy !== 1) moved = true;
      }
      expect(moved, kind).toBe(true);
    }
  });
  it('boxed rigs keep sx and sy at 1', () => {
    for (const kind of KINDS) {
      for (let ms = 0; ms < MOTIF_MS[kind]; ms += 50) {
        const p = fresh();
        applyIdleMotif(p, kind, ms, 1, false, true);
        expect(p.sx, kind).toBe(1);
        expect(p.sy, kind).toBe(1);
      }
    }
  });
  it('unboxed wobble does scale, within 1.5 percent', () => {
    const p = fresh();
    applyIdleMotif(p, 'wobble', 0, 1, false, false);
    expect(p.sx).not.toBe(1);
    expect(Math.abs(p.sx - 1)).toBeLessThanOrEqual(0.0151);
    expect(Math.abs(p.sy - 1)).toBeLessThanOrEqual(0.0151);
  });
});

describe('applyIdleMotif adds nothing', () => {
  const idle = (p: Pose): boolean => p.sx === 1 && p.sy === 1 && p.rot === 0 && p.ox === 0 && p.oy === 0 && p.alpha === 1;
  it('under reduced motion', () => {
    for (const kind of KINDS) {
      const p = fresh();
      applyIdleMotif(p, kind, 600, 1, true, false);
      expect(idle(p), kind).toBe(true);
    }
  });
  it('while walking (stand 0)', () => {
    for (const kind of KINDS) {
      const p = fresh();
      applyIdleMotif(p, kind, 600, 0, false, false);
      expect(idle(p), kind).toBe(true);
    }
  });
  it('for the none motif or a zero amount', () => {
    const a = fresh();
    applyIdleMotif(a, 'none', 600, 1, false, false);
    const b = fresh();
    applyIdleMotif(b, 'sway', 600, 1, false, false, 0);
    expect(idle(a) && idle(b)).toBe(true);
  });
  it('scales with how much the hero is standing', () => {
    const full = fresh();
    const half = fresh();
    applyIdleMotif(full, 'sway', MOTIF_MS.sway / 2, 1, false, false);
    applyIdleMotif(half, 'sway', MOTIF_MS.sway / 2, 0.5, false, false);
    expect(Math.abs(half.rot)).toBeCloseTo(Math.abs(full.rot) / 2, 9);
  });
});
