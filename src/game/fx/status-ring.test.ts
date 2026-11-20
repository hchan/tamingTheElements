import { describe, expect, it } from 'vitest';
import { RING_STATUSES, MAX_MOTES, MAX_SEGS, ringElement, ringFrame, ringPalette, saturation, stackRings, type RingArgs } from './status-ring';

const body = { x: 500, y: 300, w: 100, h: 160 };
const base = (over: Partial<RingArgs> = {}): RingArgs => ({ status: 5, element: 'fire', id: 0, body, now: 100, alpha: 1, fraction: 0.6, scale: 1, reduced: false, highContrast: false, ...over });
const sig = (a: RingArgs): string => JSON.stringify(ringFrame(a));

describe('status rings', () => {
  it('covers freeze, slow, speed, tide, daze with five distinct shapes', () => {
    expect([...RING_STATUSES].sort((a, b) => a - b)).toEqual([5, 6, 7, 9, 10]);
    expect(new Set(RING_STATUSES.map((s) => sig(base({ status: s })))).size).toBe(5);
  });

  it.each([[5, 'fire', 'air'], [10, 'fire', 'air'], [6, 'fire', 'water'], [9, 'earth', 'water'], [7, 'earth', 'earth']] as const)('ties status %i (bearer %s) to element %s', (status, bearer, want) => {
    expect(ringElement(status, bearer)).toBe(want);
  });

  it('tints speed by the bearer element', () => {
    expect(ringPalette(7, 'fire', false).rim).not.toBe(ringPalette(7, 'water', false).rim);
  });

  it('keeps every colour muted (saturation <= 0.6)', () => {
    for (const s of RING_STATUSES) {
      for (const el of ['fire', 'water', 'air', 'earth', 'void'] as const) {
        for (const hc of [false, true]) {
          const p = ringPalette(s, el, hc);
          for (const c of [p.base, p.rim, p.glint]) expect(saturation(c)).toBeLessThanOrEqual(0.6);
        }
      }
    }
  });

  it('is deterministic, phase differs by hero, reduced motion is static but not empty', () => {
    for (const s of RING_STATUSES) {
      expect(sig(base({ status: s }))).toBe(sig(base({ status: s })));
      expect(sig(base({ status: s, id: 0 }))).not.toBe(sig(base({ status: s, id: 1 })));
      expect(sig(base({ status: s, reduced: true, now: 100 }))).toBe(sig(base({ status: s, reduced: true, now: 137 })));
      expect(ringFrame(base({ status: s, reduced: true })).segs.length).toBeGreaterThan(2);
    }
  });

  it('moves between ticks when motion is on', () => {
    for (const s of [7, 9, 10]) expect(sig(base({ status: s, now: 100 }))).not.toBe(sig(base({ status: s, now: 110 })));
  });

  it('scales alpha with the loop alpha and drains the timer arc', () => {
    const full = ringFrame(base({ alpha: 1 }));
    const dim = ringFrame(base({ alpha: 0.5 }));
    expect(full.segs[1]?.alpha).toBeGreaterThan(0);
    expect(dim.segs[1]?.alpha).toBeCloseTo((full.segs[1]?.alpha ?? 0) / 2);
    expect(ringFrame(base({ fraction: 0 })).segs.length).toBe(full.segs.length - 1);
  });

  it('keeps the dark centre when the segment cap bites', () => {
    for (const s of RING_STATUSES) {
      const f = ringFrame(base({ status: s, highContrast: true }));
      expect(f.segs.length).toBeLessThanOrEqual(MAX_SEGS);
      expect(f.segs[0]?.fill).toBe(true);
      expect(f.segs[0]?.width).toBe(0);
    }
  });

  it('stacks at most two rings, hostile first, inner smaller', () => {
    expect(stackRings([7, 9, 5])).toEqual([{ status: 5, scale: 1 }, { status: 9, scale: 0.8 }]);
    expect(stackRings([7, 10, 5, 6])[0]?.status).toBe(10);
  });

  it('puts the far half above the centre line and the near half below, within the caps', () => {
    for (const s of RING_STATUSES) {
      const f = ringFrame(base({ status: s }));
      expect(f.segs.length).toBeLessThanOrEqual(MAX_SEGS);
      expect(f.motes.length).toBeLessThanOrEqual(MAX_MOTES);
      const ys = (pts: readonly number[]): number[] => pts.filter((_, i) => i % 2 === 1);
      const farRim = f.segs.find((g) => g.far && g.width > 0);
      const nearRim = f.segs.find((g) => !g.far && g.width > 0);
      expect(farRim).toBeDefined();
      expect(nearRim).toBeDefined();
      for (const y of ys(farRim?.pts ?? [])) expect(y).toBeLessThanOrEqual(f.cy + 1e-6);
      for (const y of ys(nearRim?.pts ?? [])) expect(y).toBeGreaterThanOrEqual(f.cy - 1e-6);
      expect(f.cy).toBeGreaterThan(body.y + body.h * 0.9);
    }
  });
});
