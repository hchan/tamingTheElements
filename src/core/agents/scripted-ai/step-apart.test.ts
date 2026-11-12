import { describe, expect, it } from 'vitest';
import type { Aabb } from '../../math/aabb';
import { Cmd } from '../../sim/commands';
import { stepApart } from './arcade-ai';

const pf: Aabb = { x: 0, y: 0, w: 800, h: 400 };
const box = (x: number, y: number): Aabb => ({ x, y, w: 40, h: 60 });

describe('stepApart (stale overlapped fight; nightly fun-gates stalemates)', () => {
  it('is 0 when the boxes are not overlapped', () => {
    expect(stepApart(box(0, 0), box(100, 0), pf)).toBe(0);
  });
  it('moves away from the foe along the roomier axis', () => {
    expect(stepApart(box(300, 100), box(290, 100), pf)).toBe(Cmd.right);
    expect(stepApart(box(300, 100), box(310, 100), pf)).toBe(Cmd.left);
  });
  it('turns to the other axis when the wall is in the way (wall corner)', () => {
    // Top-left corner, self left of the foe: away is left (walled), so it goes down instead.
    expect(stepApart(box(0, 10), box(5, 0), pf)).toBe(Cmd.down);
  });
});
