import { describe, expect, it } from 'vitest';
import { FLASH_MIN_GAP_TICKS, FlashGate } from './flash-gate';

describe('FlashGate', () => {
  it('lets a target flash at most 3 times in any second under a hit every tick', () => {
    const g = new FlashGate();
    const at: number[] = [];
    for (let t = 0; t < 500; t++) if (g.allow(7, t)) at.push(t);
    for (const start of at) {
      expect(at.filter((x) => x >= start && x < start + 50).length).toBeLessThanOrEqual(3);
    }
    expect(at.length).toBeGreaterThan(20);
  });
  it('gates per target and reopens after the gap', () => {
    const g = new FlashGate();
    expect(g.allow(1, 100)).toBe(true);
    expect(g.allow(2, 101)).toBe(true);
    expect(g.allow(1, 100 + FLASH_MIN_GAP_TICKS - 1)).toBe(false);
    expect(g.allow(1, 100 + FLASH_MIN_GAP_TICKS)).toBe(true);
  });
  it('resets when the view tick restarts', () => {
    const g = new FlashGate();
    expect(g.allow(1, 500)).toBe(true);
    expect(g.allow(1, 3)).toBe(true);
  });
});
