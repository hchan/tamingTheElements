import { describe, expect, it } from 'vitest';
import type { Aabb } from '../../math/aabb';
import { Cmd } from '../../sim/commands';
import { stepApart, wallHold } from './arcade-ai';

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

describe('wallHold (Hard AI gap rule, WALL-3b)', () => {
  const MOVE = Cmd.left | Cmd.right | Cmd.up | Cmd.down;
  const atk = Cmd.primary;
  // Boxes are 40 wide: a left-wall foe at x=0 spans 0..40, a right-wall foe at x=760 spans 760..800.
  it('leaves the command alone when the foe is not near a side wall', () => {
    expect(wallHold(box(400, 100), box(350, 100), Cmd.left | atk, pf, false)).toBe(Cmd.left | atk);
  });
  it('leaves the command alone without a vertical overlap', () => {
    expect(wallHold(box(20, 200), box(0, 0), Cmd.left, pf, false)).toBe(Cmd.left);
  });
  it('steps away from an overlapped foe at either wall', () => {
    expect(wallHold(box(10, 100), box(0, 100), Cmd.left, pf, false) & MOVE).toBe(Cmd.right);
    expect(wallHold(box(750, 100), box(760, 100), Cmd.right, pf, false) & MOVE).toBe(Cmd.left);
  });
  it('inside the hold band it drops the toward bit and keeps the attack bits', () => {
    // gap 20 (melee hold 32, slack 16: 16 <= 20 <= 32): only the toward bit goes.
    expect(wallHold(box(60, 100), box(0, 100), Cmd.left | atk, pf, false)).toBe(atk);
    expect(wallHold(box(700, 100), box(760, 100), Cmd.right | atk, pf, false)).toBe(atk);
  });
  it('below the hold slack it backs off with the away bit', () => {
    // gap 5 < 16.
    expect(wallHold(box(45, 100), box(0, 100), atk, pf, false)).toBe(atk | Cmd.right);
  });
  it('a wide melee hero (extra) backs off inside the longer hold; extra 0 is unchanged (SIM_VERSION 121)', () => {
    // gap 20: extra 0 = in the band (drops the toward bit only); extra 30 = hold 62, 20 < 62 - 16, so it backs off.
    expect(wallHold(box(60, 100), box(0, 100), Cmd.left | atk, pf, false, 0)).toBe(atk);
    expect(wallHold(box(60, 100), box(0, 100), Cmd.left | atk, pf, false, 30)).toBe(atk | Cmd.right);
    // Ranged ignores extra: gap 60 is inside the ranged hold either way.
    expect(wallHold(box(100, 100), box(0, 100), Cmd.left, pf, true, 30)).toBe(wallHold(box(100, 100), box(0, 100), Cmd.left, pf, true));
    // Past hold + extra the command is unchanged.
    expect(wallHold(box(120, 100), box(0, 100), Cmd.left, pf, false, 30)).toBe(Cmd.left);
  });
  it('holds a longer gap for a ranged hero', () => {
    // gap 60: past the melee hold (32), inside the ranged one (144).
    expect(wallHold(box(100, 100), box(0, 100), Cmd.left, pf, false)).toBe(Cmd.left);
    expect(wallHold(box(100, 100), box(0, 100), Cmd.left, pf, true) & Cmd.left).toBe(0);
  });
  it('falls back to stepApart when there is no room away from the foe', () => {
    const narrow: Aabb = { x: 0, y: 0, w: 60, h: 400 };
    const self = box(20, 100);
    const foe = box(0, 100);
    expect(wallHold(self, foe, 0, narrow, false) & MOVE).toBe(stepApart(self, foe, narrow));
  });
  it('never emits a diagonal', () => {
    for (const cmd of [0, Cmd.up | Cmd.left, Cmd.down | Cmd.right, Cmd.left | Cmd.up | atk]) {
      // Overlapped (5) and below the slack (45): the rule sets the walk, so whatever came in leaves as one bit.
      for (const x of [5, 45]) {
        const bits = wallHold(box(x, 100), box(0, 100), cmd, pf, false) & MOVE;
        expect([0, Cmd.left, Cmd.right, Cmd.up, Cmd.down]).toContain(bits);
      }
    }
  });
});
