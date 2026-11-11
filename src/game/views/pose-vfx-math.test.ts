import { describe, expect, it } from 'vitest';
import { ELEMENTS } from '@core/index';
import { ELEMENT_FX, FX_ELEMENTS, GlowMode, easeOut, fade, glowLook, lcg, spread, unit } from './pose-vfx-math';

describe('pose-vfx-math', () => {
  it('has a distinct entry per element and indexes them all', () => {
    expect([...FX_ELEMENTS].sort()).toEqual([...ELEMENTS].sort());
    const looks = new Set(ELEMENTS.map((e) => JSON.stringify(ELEMENT_FX[e])));
    expect(looks.size).toBe(ELEMENTS.length);
    expect(ELEMENT_FX.fire.gravity).toBeLessThan(0);
    expect(ELEMENT_FX.earth.gravity).toBeGreaterThan(ELEMENT_FX.water.gravity);
    expect(ELEMENT_FX.void.speed).toBeLessThan(0);
  });

  it('draws a reproducible stream in [0, 1)', () => {
    let a = 12345;
    let b = 12345;
    for (let i = 0; i < 50; i++) {
      a = lcg(a);
      b = lcg(b);
      expect(a).toBe(b);
      expect(unit(a)).toBeGreaterThanOrEqual(0);
      expect(unit(a)).toBeLessThan(1);
    }
  });

  it('keeps spread vectors bounded and never zero', () => {
    const o = { x: 0, y: 0 };
    let s = 7;
    for (let i = 0; i < 200; i++) {
      s = lcg(s);
      const a = unit(s);
      s = lcg(s);
      spread(a, unit(s), o);
      const len = Math.hypot(o.x, o.y);
      expect(len).toBeLessThanOrEqual(1.5);
      expect(len).toBeGreaterThan(0.1);
    }
    spread(0.5, 0.5, o);
    expect(Number.isFinite(o.x + o.y)).toBe(true);
  });

  it('fades and eases monotonically and clamps', () => {
    expect(fade(0)).toBe(1);
    expect(fade(1)).toBe(0);
    expect(fade(2)).toBe(0);
    expect(easeOut(0)).toBe(0);
    expect(easeOut(1)).toBe(1);
    expect(easeOut(0.3)).toBeLessThan(easeOut(0.6));
  });

  it('swells a charge, shrinks a release and only fades when reduced', () => {
    const a = { scale: 0, alpha: 0 };
    const b = { scale: 0, alpha: 0 };
    glowLook(GlowMode.charge, 0.2, false, a);
    glowLook(GlowMode.charge, 0.9, false, b);
    expect(b.scale).toBeGreaterThan(a.scale);
    expect(b.alpha).toBeGreaterThan(a.alpha);
    glowLook(GlowMode.release, 0, false, a);
    glowLook(GlowMode.release, 0.8, false, b);
    expect(b.scale).toBeLessThan(a.scale);
    expect(b.alpha).toBeLessThan(a.alpha);
    glowLook(GlowMode.charge, 0.1, true, a);
    glowLook(GlowMode.charge, 0.7, true, b);
    expect(b.scale).toBe(a.scale);
    expect(b.alpha).toBeLessThan(a.alpha);
  });
});
