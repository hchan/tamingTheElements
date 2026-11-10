import { describe, expect, it } from 'vitest';
import {
  POSE_MS, PoseKind, STRIDE_PX, applyPose, breathe, easeOutBack, easeOutCubic, follow, headingOf, koFall, leanFor, lerpAngle,
  resetPose, shortestArc, walkFrame, type Pose,
} from './pose-math';

const fresh = (): Pose => resetPose({ sx: 1, sy: 1, rot: 0, ox: 0, oy: 0, alpha: 1 });
const ms = (kind: number): number => POSE_MS[kind] ?? 0;

describe('walk cycle by distance walked', () => {
  it('advances one frame per stride and loops', () => {
    expect(walkFrame(0, 4)).toBe(0);
    expect(walkFrame(STRIDE_PX - 0.01, 4)).toBe(0);
    expect(walkFrame(STRIDE_PX, 4)).toBe(1);
    expect(walkFrame(STRIDE_PX * 4, 4)).toBe(0);
    expect(walkFrame(STRIDE_PX * 9.5, 4)).toBe(1);
    expect(walkFrame(500, 0)).toBe(0);
  });

  it('matches the old fixed 8 fps at the base speed (5 px per tick, 6 ticks per frame)', () => {
    expect(STRIDE_PX).toBe(5 * 6);
  });

  it('cycles faster for a faster walker (dash, speed buff) and slower for a slowed one', () => {
    const steps = (pxPerTick: number): number => {
      let phase = 0;
      let n = 0;
      let last = 0;
      for (let t = 0; t < 100; t++) {
        phase += pxPerTick;
        const f = walkFrame(phase, 4);
        if (f !== last) n++;
        last = f;
      }
      return n;
    };
    expect(steps(10)).toBeGreaterThan(steps(5));
    expect(steps(5)).toBeGreaterThan(steps(2));
  });
});

describe('shortest-arc rotation', () => {
  it('takes the short way round 0/360', () => {
    expect(shortestArc(350, 10)).toBe(20);
    expect(shortestArc(10, 350)).toBe(-20);
    expect(shortestArc(0, 90)).toBe(90);
    expect(shortestArc(315, 0)).toBe(45);
    expect(Math.abs(shortestArc(0, 180))).toBe(180);
    expect(shortestArc(45, 45)).toBe(0);
  });

  it('interpolates without a spin across the wrap', () => {
    for (const t of [0, 0.25, 0.5, 0.75, 1]) expect(lerpAngle(350, 10, t)).toBeCloseTo(350 + 20 * t, 9);
    let a = 315;
    for (let i = 0; i < 40; i++) {
      const next = lerpAngle(a, 0, 0.3);
      expect(Math.abs(next - a)).toBeLessThanOrEqual(45);
      a = next;
    }
    expect(shortestArc(a, 0)).toBeCloseTo(0, 2);
  });
});

describe('heading, lean and easing', () => {
  it('maps a displacement to dir8 (0 east, counter-clockwise on screen, y down)', () => {
    expect([headingOf(1, 0), headingOf(1, -1), headingOf(0, -1), headingOf(-1, -1)]).toEqual([0, 1, 2, 3]);
    expect([headingOf(-1, 0), headingOf(-1, 1), headingOf(0, 1), headingOf(1, 1), headingOf(0, 0)]).toEqual([4, 5, 6, 7, -1]);
  });

  it('leans towards the heading, more on diagonals, never when walking straight up or down', () => {
    expect(leanFor(0)).toBeGreaterThan(0);
    expect(leanFor(4)).toBe(-leanFor(0));
    expect(Math.abs(leanFor(1))).toBeGreaterThan(Math.abs(leanFor(0)));
    expect(leanFor(1)).toBe(leanFor(7));
    expect(leanFor(3)).toBe(leanFor(5));
    expect(leanFor(2)).toBe(0);
    expect(leanFor(6)).toBe(0);
    expect(Math.abs(leanFor(1))).toBeLessThanOrEqual(10);
  });

  it('follows exponentially and independently of the frame rate', () => {
    const at = (hz: number): number => {
      let v = 0;
      for (let i = 0; i < hz / 4; i++) v += (1 - v) * follow(1000 / hz, 60);
      return v;
    };
    expect(at(60)).toBeCloseTo(at(144), 6);
    expect(at(60)).toBeCloseTo(at(120), 6);
    expect(follow(0, 60)).toBe(0);
  });

  it('eases monotonically between 0 and 1 (the back ease overshoots once)', () => {
    let prev = -1;
    for (let t = 0; t <= 1.0001; t += 0.05) {
      const v = easeOutCubic(t);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
    expect(Math.max(...[0.5, 0.6, 0.7, 0.8].map(easeOutBack))).toBeGreaterThan(1);
    expect(easeOutBack(1)).toBeCloseTo(1, 9);
  });
});

describe('poses', () => {
  it('every transient pose starts and ends at identity', () => {
    for (const kind of [PoseKind.cast, PoseKind.hurt, PoseKind.dash, PoseKind.victory]) {
      for (const age of [0, ms(kind)]) {
        const p = fresh();
        applyPose(p, kind, age, 1, 1, false);
        expect(p.sx).toBeCloseTo(1, 6);
        expect(p.sy).toBeCloseTo(1, 6);
        expect(p.rot).toBeCloseTo(0, 6);
        expect(p.oy).toBeCloseTo(0, 6);
        expect(Math.abs(p.ox)).toBeLessThanOrEqual(4);
      }
    }
  });

  it('cast winds up then stretches; dash stretches along the heading; hurt pushes away; victory hops', () => {
    const wind = fresh();
    applyPose(wind, PoseKind.cast, ms(PoseKind.cast) * 0.3, 1, 1, false);
    expect(wind.sy).toBeLessThan(1);
    const release = fresh();
    applyPose(release, PoseKind.cast, ms(PoseKind.cast) * 0.5, 1, 1, false);
    expect(release.sy).toBeGreaterThan(1);
    const dash = fresh();
    applyPose(dash, PoseKind.dash, ms(PoseKind.dash) / 2, 1, 1, false);
    expect(dash.sx).toBeGreaterThan(1);
    expect(dash.sy).toBeLessThan(1);
    const hurt = fresh();
    applyPose(hurt, PoseKind.hurt, 40, 1, 1, false);
    expect(hurt.rot).toBeLessThan(0);
    expect(hurt.ox).toBeLessThan(0);
    const hop = fresh();
    applyPose(hop, PoseKind.victory, ms(PoseKind.victory) / 4, 1, 0, false);
    expect(hop.oy).toBeLessThan(-10);
  });

  it('reduced motion drops movement, scale and spin but keeps the tag-in as a fade', () => {
    for (const kind of [PoseKind.cast, PoseKind.hurt, PoseKind.dash, PoseKind.victory]) {
      const p = fresh();
      applyPose(p, kind, ms(kind) / 2, 1, 1, true);
      expect(p).toEqual(fresh());
    }
    const tag = fresh();
    applyPose(tag, PoseKind.tagIn, 40, 1, 1, true);
    expect(tag.ox).toBe(0);
    expect(tag.alpha).toBeLessThan(1);
    const slide = fresh();
    applyPose(slide, PoseKind.tagIn, 40, 1, 1, false);
    expect(slide.ox).toBeLessThan(0);
  });

  it('the KO fall tips over and fades, or only fades when reduced', () => {
    const a = fresh();
    koFall(a, 0.5, 1, false);
    expect(a.rot).toBeGreaterThan(40);
    const b = fresh();
    koFall(b, 1, 1, false);
    expect(b.alpha).toBe(0);
    const r = fresh();
    koFall(r, 0.8, 1, true);
    expect(r.rot).toBe(0);
    expect(r.alpha).toBeLessThan(1);
  });

  it('breathing is a small zero-mean wave that vanishes while walking', () => {
    let min = 1;
    let max = 1;
    for (let t = 0; t < 2400; t += 10) {
      const p = fresh();
      breathe(p, t, 1);
      min = Math.min(min, p.sy);
      max = Math.max(max, p.sy);
    }
    expect(max - 1).toBeLessThan(0.02);
    expect(1 - min).toBeLessThan(0.02);
    expect(max - 1).toBeGreaterThan(0.01);
    const w = fresh();
    breathe(w, 600, 0);
    expect(w.sy).toBe(1);
  });
});
