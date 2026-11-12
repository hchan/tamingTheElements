import { describe, expect, it } from 'vitest';
import { BRACKET_PX, DANGER_FLASH_TICKS, DANGER_STEADY_ALPHA, bracketLen, dangerAlpha, dashBox, dashEdge } from './danger-zone';

describe('danger zone outline', () => {
  it('pulses only in the first ticks and only with motion', () => {
    const early = Array.from({ length: DANGER_FLASH_TICKS }, (_, i) => dangerAlpha(i, false));
    expect(new Set(early).size).toBe(2);
    expect(dangerAlpha(DANGER_FLASH_TICKS, false)).toBe(DANGER_STEADY_ALPHA);
    for (let i = 0; i < 40; i++) expect(dangerAlpha(i, true)).toBe(DANGER_STEADY_ALPHA);
  });
  it('dashes stay inside the edge and leave gaps', () => {
    const d = dashEdge(10, 20, 100, true);
    expect(d.length).toBeGreaterThan(2);
    for (const [x0 = 0, y0 = 0, x1 = 0, y1 = 0] of d) {
      expect(x0).toBeGreaterThanOrEqual(10);
      expect(x1).toBeLessThanOrEqual(110);
      expect(y0).toBe(20);
      expect(y1).toBe(20);
    }
    expect(d[1]?.[0]).toBeGreaterThan(d[0]?.[2] ?? 0);
  });
  it('outlines a 240x240 box on all four sides', () => {
    const d = dashBox(0, 0, 240, 240);
    expect(d.some((s) => s[1] === 0 && s[3] === 0)).toBe(true);
    expect(d.some((s) => s[1] === 240 && s[3] === 240)).toBe(true);
    expect(d.some((s) => s[0] === 0 && s[2] === 0)).toBe(true);
    expect(d.some((s) => s[0] === 240 && s[2] === 240)).toBe(true);
  });
  it('brackets shrink on thin boxes', () => {
    expect(bracketLen(240, 240)).toBe(BRACKET_PX);
    expect(bracketLen(240, 40)).toBeLessThan(BRACKET_PX);
    expect(bracketLen(240, 6)).toBe(4);
  });
});
