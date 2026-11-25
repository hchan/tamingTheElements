import { describe, expect, it } from 'vitest';
import { KO_FALLBACK_HEROES, KO_FALLBACK_MS, koFallbackFor, koFallbackFrames } from './ko-fallback';

describe('ko fallback', () => {
  it('covers exactly the heroes with no KO art', () => {
    expect([...KO_FALLBACK_HEROES]).toEqual(['umbrel']);
    expect(KO_FALLBACK_MS).toBeGreaterThanOrEqual(600);
    expect(KO_FALLBACK_MS).toBeLessThanOrEqual(900);
  });

  it('needs a loss and an eligible hero (released, so no flag)', () => {
    expect(koFallbackFor('umbrel', true, '?ff=roster24', true)).toBe(true);
    expect(koFallbackFor('nykra', true, '?ff=play,roster24', true)).toBe(false);
    expect(koFallbackFor('umbrel', false, '?ff=roster24', true)).toBe(false);
    expect(koFallbackFor('glimmaw', true, '?ff=roster24', true)).toBe(false);
    expect(koFallbackFor('umbrel', true, '', true)).toBe(true); // released: no flag needed
    expect(koFallbackFor('umbrel', true, '', false)).toBe(true);
    expect(koFallbackFor('umbrel', false, '', false)).toBe(false);
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
