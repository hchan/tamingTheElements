import { describe, expect, it } from 'vitest';
import { KO_FALLBACK_HEROES, KO_FALLBACK_MS, koFallbackFor, koFallbackFrames } from './ko-fallback';

describe('ko fallback', () => {
  it('covers exactly the heroes with no KO art (none: every roster24 KO still is shipped)', () => {
    expect([...KO_FALLBACK_HEROES]).toEqual([]);
    expect(KO_FALLBACK_MS).toBeGreaterThanOrEqual(600);
    expect(KO_FALLBACK_MS).toBeLessThanOrEqual(900);
  });

  it('needs a loss and an eligible hero (none now: Umbrel, Nykra and Abyssor show a KO still instead)', () => {
    for (const h of ['umbrel', 'nykra', 'abyssor', 'glimmaw']) {
      expect(koFallbackFor(h, true, '?ff=roster24', true), h).toBe(false);
      expect(koFallbackFor(h, true, '', false), h).toBe(false);
    }
  });

  it('slumps and greys out; reduced motion keeps colour only', () => {
    const f = koFallbackFrames(false);
    expect(f[0]?.transform).toContain('rotate(0deg)');
    expect(f.at(-1)?.transform).toContain('rotate(-18deg)');
    expect(f.at(-1)?.filter).toContain('grayscale(1)');
    const r = koFallbackFrames(true);
    expect(r.every((k) => k.transform === undefined)).toBe(true);
    expect(r.at(-1)?.filter).toContain('grayscale(1)');
  });
});
