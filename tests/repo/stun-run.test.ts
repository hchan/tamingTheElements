import { describe, expect, it } from 'vitest';
import { StunRunCounter } from '../../tools/sim/stun-run';

describe('StunRunCounter', () => {
  it('counts a run in world ticks and in game ticks (held clock ticks add to W only)', () => {
    const c = new StunRunCounter();
    for (const g of [10, 11, 11, 11, 11, 11, 12]) expect(c.tick(true, g)).toBe(0);
    expect(c.longestW).toBe(7);
    expect(c.longestGame).toBe(3);
    expect(c.tick(false, 13)).toBe(7);
  });

  it('a break starts a new run and keeps the longest', () => {
    const c = new StunRunCounter();
    for (let g = 0; g < 5; g++) c.tick(true, g);
    c.tick(false, 5);
    for (let g = 6; g < 8; g++) c.tick(true, g);
    expect([c.longestW, c.longestGame]).toEqual([5, 5]);
  });
});
