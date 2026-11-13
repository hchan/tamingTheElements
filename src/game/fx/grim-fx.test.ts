import { describe, expect, it } from 'vitest';
import { embers, hash01, mute } from './grim-fx';

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
});
