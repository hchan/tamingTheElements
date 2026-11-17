import { describe, expect, it } from 'vitest';
import { FADE_FLOOR, fireBlastFxStrength, impactFade, trailFade } from './fire-blast-fade';

describe('fire blast fx fade', () => {
  it('is full strength for non-fading projectiles and a fresh blast', () => {
    expect(fireBlastFxStrength(undefined)).toBe(1);
    expect(fireBlastFxStrength(1000)).toBe(1);
    expect(fireBlastFxStrength(NaN)).toBe(1);
  });
  it('follows the sim alpha down to the floor and never below it', () => {
    expect(fireBlastFxStrength(675)).toBeCloseTo(0.675);
    expect(fireBlastFxStrength(350)).toBeCloseTo(FADE_FLOOR);
    expect(fireBlastFxStrength(0)).toBe(FADE_FLOOR);
    expect(fireBlastFxStrength(5000)).toBe(1);
  });
  it('is monotonic: weaker blast, fainter and smaller trail and impact', () => {
    let pt = trailFade(1);
    let pi = impactFade(1);
    expect(pt).toEqual({ alpha: 1, size: 1 });
    expect(pi).toEqual({ count: 1, size: 1, alpha: 1 });
    for (let s = 0.95; s >= FADE_FLOOR; s -= 0.05) {
      const t = trailFade(s);
      const i = impactFade(s);
      expect(t.alpha).toBeLessThan(pt.alpha);
      expect(t.size).toBeLessThan(pt.size);
      expect(i.count).toBeLessThan(pi.count);
      expect(i.alpha).toBeLessThan(pi.alpha);
      pt = t;
      pi = i;
    }
    expect(impactFade(FADE_FLOOR).count).toBeGreaterThan(0.5);
  });
});
