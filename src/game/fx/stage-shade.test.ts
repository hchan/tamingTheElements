import { describe, expect, it } from 'vitest';
import { shadeRect } from './stage-shade';

describe('stage-shade helpers', () => {
  it('centres the pool on the body, wider than it, and low enough to read as cast on the floor', () => {
    const r = shadeRect(100, 200, 80, 120);
    expect(r.cx).toBe(140);
    expect(r.w).toBeGreaterThan(80);
    expect(r.cy).toBeGreaterThan(200 + 60);
    expect(r.cy).toBeLessThan(200 + 120);
  });
});
