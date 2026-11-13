import { describe, expect, it } from 'vitest';
import { embers, gradeRgba, hash01, mute } from './grim-fx';

describe('grim fx helpers', () => {
  it('mute desaturates and darkens, keeping the colour channels ordered', () => {
    const m = mute(0xff7a1a);
    expect((m >> 16) & 255).toBeLessThan(0xff);
    expect((m >> 16) & 255).toBeGreaterThan(m & 255);
    expect(mute(0x808080, 0.6, 1)).toBe(0x808080);
  });
  it('hash01 is deterministic and in range', () => {
    for (let i = 0; i < 50; i++) {
      expect(hash01(i, 3)).toBe(hash01(i, 3));
      expect(hash01(i, 3)).toBeGreaterThanOrEqual(0);
      expect(hash01(i, 3)).toBeLessThan(1);
    }
  });
  it('embers drift with age, but hold still (and visible) under reduced motion', () => {
    expect(embers(0, 0, 100, 3, false, 10)).not.toEqual(embers(0, 0, 100, 30, false, 10));
    expect(embers(0, 0, 100, 3, true, 10)).toEqual(embers(0, 0, 100, 30, true, 10));
    expect(embers(0, 0, 100, 3, true, 10).some((e) => e.a > 0.3)).toBe(true);
  });
  it('gradeRgba desaturates and darkens pixels, keeps alpha, and is deterministic', () => {
    const a = [255, 40, 10, 200, 10, 200, 40, 255];
    const b = [...a];
    gradeRgba(a);
    gradeRgba(b);
    expect(a).toEqual(b);
    expect(a[3]).toBe(200);
    expect(a[7]).toBe(255);
    const spread = (i: number): number => Math.max(a[i] ?? 0, a[i + 1] ?? 0, a[i + 2] ?? 0) - Math.min(a[i] ?? 0, a[i + 1] ?? 0, a[i + 2] ?? 0);
    expect(spread(0)).toBeLessThan(255 - 10);
    expect(spread(0)).toBeLessThan(150);
    expect(a[0] ?? 0).toBeLessThan(255);
  });
});
