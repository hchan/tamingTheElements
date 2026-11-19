import { describe, expect, it } from 'vitest';
import { ALL_ABILITIES } from '@core/index';
import { REDUCED_FADE_MS } from './motion';
import {
  SMOOTH_KIND,
  columnEnvelope,
  hurricaneSpin,
  lungeStretch,
  meleeFadeOut,
  meleeGrowIn,
  pulseBump,
  settlePose,
  smoothKindForDef,
  throwBlend,
  throwDrawn,
} from './ability-smooth';

const BAD = [Number.NaN, -5, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY];

describe('SMOOTH_KIND', () => {
  it('maps every listed sprite to a real ability def', () => {
    for (const key of Object.keys(SMOOTH_KIND)) {
      const idx = ALL_ABILITIES.findIndex((d) => d.sprite === key);
      expect(idx, key).toBeGreaterThanOrEqual(0);
      expect(smoothKindForDef(idx)).toBe(SMOOTH_KIND[key]);
    }
  });
  it('returns undefined for unmapped or invalid indices', () => {
    expect(smoothKindForDef(-1)).toBeUndefined();
    expect(smoothKindForDef(Number.NaN)).toBeUndefined();
    expect(smoothKindForDef(99999)).toBeUndefined();
    const plain = ALL_ABILITIES.findIndex((d) => !(d.sprite in SMOOTH_KIND));
    expect(smoothKindForDef(plain)).toBeUndefined();
  });
});

describe('melee', () => {
  it('grows in from 0.8/0.6 to 1/1 and never drops below 0.8 scale', () => {
    const a = meleeGrowIn(0, false);
    expect(a.scale).toBeCloseTo(0.8);
    expect(a.alpha).toBeCloseTo(0.6);
    const z = meleeGrowIn(1000, false);
    expect(z.scale).toBeCloseTo(1);
    expect(z.alpha).toBe(1);
    for (let t = 0; t <= 80; t += 1) expect(meleeGrowIn(t, false).scale).toBeGreaterThanOrEqual(0.8);
  });
  it('reduced: no scale change, short alpha fade only', () => {
    expect(meleeGrowIn(0, true).scale).toBe(1);
    expect(meleeGrowIn(REDUCED_FADE_MS, true)).toEqual({ scale: 1, alpha: 1 });
  });
  it('fades out over the last 60 ms', () => {
    expect(meleeFadeOut(500)).toBe(1);
    expect(meleeFadeOut(30)).toBeCloseTo(0.5);
    expect(meleeFadeOut(0)).toBe(0);
  });
});

describe('settlePose and lungeStretch', () => {
  it('settle starts and ends at 1, squashes in between', () => {
    expect(settlePose(0)).toEqual({ sx: 1, sy: 1 });
    expect(settlePose(1).sy).toBeCloseTo(1);
    const mid = settlePose(0.3);
    expect(mid.sy).toBeLessThan(1);
    expect(mid.sx).toBeGreaterThan(1);
    expect(settlePose(0.3, true)).toEqual({ sx: 1, sy: 1 });
  });
  it('stretch is bounded, eases to 1 at rest, and trails only above 6 px/tick', () => {
    expect(lungeStretch(0, false)).toEqual({ sx: 1, sy: 1, trail: false });
    const fast = lungeStretch(100, false);
    expect(fast.sx).toBeCloseTo(1.15);
    expect(fast.sy).toBeCloseTo(0.9);
    expect(lungeStretch(6, false).trail).toBe(false);
    expect(lungeStretch(6.5, false).trail).toBe(true);
    let prev = 1;
    for (let s = 0; s <= 14; s += 0.5) {
      const { sx } = lungeStretch(s, false);
      expect(sx).toBeGreaterThanOrEqual(prev - 1e-12);
      prev = sx;
    }
  });
  it('reduced: no stretch or trail', () => {
    expect(lungeStretch(50, true)).toEqual({ sx: 1, sy: 1, trail: false });
  });
});

describe('throwBlend', () => {
  it('starts at 0, ends at exactly 1, monotonic, never passes sim', () => {
    expect(throwBlend(0)).toBe(0);
    expect(throwBlend(140)).toBe(1);
    expect(throwBlend(10000)).toBe(1);
    let prev = 0;
    for (let t = 0; t <= 200; t += 1) {
      const f = throwBlend(t, 140);
      expect(f).toBeGreaterThanOrEqual(prev);
      expect(f).toBeLessThanOrEqual(1);
      prev = f;
    }
    for (let t = 0; t <= 200; t += 5) {
      const d = throwDrawn(10, 100, t);
      expect(d).toBeGreaterThanOrEqual(10);
      expect(d).toBeLessThanOrEqual(100);
    }
    expect(throwDrawn(10, 100, 140)).toBe(100);
  });
  it('drawn velocity has no jump (sim moving at constant speed)', () => {
    const v = 0.3; // px/ms
    let prevVel: number | undefined;
    for (let t = 0; t < 260; t += 1) {
      const a = throwDrawn(0, 50 + v * t, t);
      const b = throwDrawn(0, 50 + v * (t + 1), t + 1);
      const vel = b - a;
      if (prevVel !== undefined) expect(Math.abs(vel - prevVel)).toBeLessThan(0.1);
      prevVel = vel;
    }
  });
  it('is sane for bad input', () => {
    for (const b of BAD) {
      expect(Number.isFinite(throwBlend(b))).toBe(true);
      expect(Number.isFinite(throwBlend(10, b))).toBe(true);
    }
    expect(throwBlend(5, 0)).toBe(1);
  });
});

describe('spin and pulse', () => {
  it('spin is continuous, increasing, and zero when reduced', () => {
    expect(hurricaneSpin(0, false)).toBe(0);
    expect(hurricaneSpin(100, false)).toBeLessThan(hurricaneSpin(200, false));
    expect(hurricaneSpin(5000, true)).toBe(0);
  });
  it('pulse goes 1 -> 1.06 -> 1', () => {
    expect(pulseBump(0)).toBe(1);
    expect(pulseBump(80)).toBeCloseTo(1.06);
    expect(pulseBump(160)).toBe(1);
    expect(pulseBump(1000)).toBe(1);
  });
});

describe('columnEnvelope', () => {
  const LIFE = 2000;
  it('starts small and transparent, is full mid-life, ends transparent', () => {
    const s = columnEnvelope(0, LIFE, false);
    expect(s.scaleY).toBeCloseTo(0.2);
    expect(s.alpha).toBe(0);
    expect(columnEnvelope(1000, LIFE, false)).toEqual({ scaleY: 1, alpha: 1 });
    expect(columnEnvelope(LIFE, LIFE, false).alpha).toBe(0);
  });
  it('has no velocity jump in scaleY or alpha (finite difference)', () => {
    let prev: { dy: number; da: number } | undefined;
    for (let t = 0; t < LIFE; t += 1) {
      const a = columnEnvelope(t, LIFE, false);
      const b = columnEnvelope(t + 1, LIFE, false);
      const cur = { dy: b.scaleY - a.scaleY, da: b.alpha - a.alpha };
      if (prev) {
        expect(Math.abs(cur.dy - prev.dy)).toBeLessThan(0.001);
        expect(Math.abs(cur.da - prev.da)).toBeLessThan(0.001);
      }
      prev = cur;
    }
  });
  it('reduced: fixed height, short fades only', () => {
    expect(columnEnvelope(0, LIFE, true)).toEqual({ scaleY: 1, alpha: 0 });
    expect(columnEnvelope(1000, LIFE, true)).toEqual({ scaleY: 1, alpha: 1 });
    expect(columnEnvelope(LIFE, LIFE, true).alpha).toBe(0);
  });
  it('stays finite and in range for a short life (grow and fade overlap)', () => {
    for (let t = 0; t <= 300; t += 10) {
      const e = columnEnvelope(t, 200, false);
      expect(e.alpha).toBeGreaterThanOrEqual(0);
      expect(e.alpha).toBeLessThanOrEqual(1);
      expect(e.scaleY).toBeGreaterThan(0);
    }
  });
});

describe('bad inputs return finite values', () => {
  it('every function', () => {
    for (const b of BAD) {
      for (const r of [false, true]) {
        const g = meleeGrowIn(b, r);
        expect(Number.isFinite(g.scale) && Number.isFinite(g.alpha)).toBe(true);
        expect(g.scale).toBeGreaterThanOrEqual(0.8 - 1e-12);
        const l = lungeStretch(b, r);
        expect(Number.isFinite(l.sx) && Number.isFinite(l.sy)).toBe(true);
        expect(Number.isFinite(hurricaneSpin(b, r))).toBe(true);
        const c = columnEnvelope(b, b, r);
        expect(Number.isFinite(c.scaleY) && Number.isFinite(c.alpha)).toBe(true);
        const s = settlePose(b, r);
        expect(Number.isFinite(s.sx) && Number.isFinite(s.sy)).toBe(true);
      }
      expect(Number.isFinite(meleeFadeOut(b))).toBe(true);
      expect(Number.isFinite(pulseBump(b))).toBe(true);
    }
  });
});
