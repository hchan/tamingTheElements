import { describe, expect, it } from 'vitest';
import { POP_CEIL_FLOOR, POP_CEIL_PAD, POP_LANE_PX, POP_NUMBER_CLEAR_PX, POP_MAX_LANES, popCeil, popLaneLift, clearOfChips } from './pop-lanes';
import { SCRIM_BOTTOM } from '../hud/slim-hud';

describe('popLaneLift', () => {
  it('does not lift the first pop', () => {
    expect(popLaneLift([], 100, 100)).toBe(0);
  });
  it('takes the next lane up for each lane a nearby live pop occupies', () => {
    expect(popLaneLift([{ x: 100, y: 100 }], 110, 95)).toBe(POP_LANE_PX);
    expect(popLaneLift([{ x: 100, y: 100 }, { x: 105, y: 100 - POP_LANE_PX }], 100, 100)).toBe(2 * POP_LANE_PX);
  });
  it('reads a pop base y plus its lift as where it is drawn', () => {
    expect(popLaneLift([{ x: 100, y: 100, lift: POP_LANE_PX }], 100, 100)).toBe(0);
  });
  it('reuses a freed lane 0 while lane 1 is still taken', () => {
    expect(popLaneLift([{ x: 100, y: 100 - POP_LANE_PX }], 100, 100)).toBe(0);
  });
  it('takes the top lane when every lane is taken', () => {
    const live = [0, 1, 2, 3].map((k) => ({ x: 100, y: 100 - k * POP_LANE_PX }));
    expect(popLaneLift(live, 100, 100)).toBe(POP_MAX_LANES * POP_LANE_PX);
  });
  it('ignores pops over the other fighter', () => {
    expect(popLaneLift([{ x: 700, y: 100 }], 100, 100)).toBe(0);
  });
  it('starts a call-out clear of the damage number on the same fighter', () => {
    // The damage number is about 34 px tall at the fighter's top; the call-out clears it.
    expect(POP_NUMBER_CLEAR_PX).toBeGreaterThanOrEqual(38 + 24 + 4);
  });
});

describe('popCeil', () => {
  const chip = (x: number, y: number, w = 100, h = 20): { x: number; y: number; w: number; h: number } => ({ x, y, w, h });
  it('is the scrim bottom with no rects', () => {
    expect(popCeil(undefined, 0, 50)).toBe(POP_CEIL_FLOOR);
    expect(popCeil([[], []], 0, 50)).toBe(POP_CEIL_FLOOR);
  });
  it('sits under an overlapping chip by the pad', () => {
    expect(popCeil([[chip(0, 81)]], 40, 90)).toBe(81 + 20 + POP_CEIL_PAD);
  });
  it('ignores a chip it does not overlap, and one it only touches', () => {
    expect(popCeil([[chip(300, 81)]], 0, 50)).toBe(POP_CEIL_FLOOR);
    expect(popCeil([[chip(100, 81)]], 0, 100)).toBe(POP_CEIL_FLOOR);
  });
  it('takes the lowest of two wrapped rows and reads both teams', () => {
    expect(popCeil([[chip(0, 81), chip(0, 105)], []], 10, 20)).toBe(105 + 20 + POP_CEIL_PAD);
    expect(popCeil([[], [chip(0, 90)]], 10, 20)).toBe(90 + 20 + POP_CEIL_PAD);
  });
  it('is pinned to the scrim bottom', () => {
    expect(POP_CEIL_FLOOR).toBe(SCRIM_BOTTOM);
  });
});

describe('clearOfChips (qa-r110: the weather badge must not hide a status chip)', () => {
  const chip = { x: 700, y: 120, w: 130, h: 24 };
  it('leaves a plate alone when there are no chips, or the chip is off to the side or well above', () => {
    expect(clearOfChips(undefined, 750, 910, 142, 52)).toBe(142);
    expect(clearOfChips([[chip], []], 900 + 20, 1000, 142, 52)).toBe(142);
    expect(clearOfChips([[{ ...chip, y: 70 }], []], 750, 910, 142, 52)).toBe(142);
  });
  it('slides the plate under a chip it overlaps, keeping the pad', () => {
    expect(clearOfChips([[], [chip]], 750, 910, 142, 52)).toBe(120 + 24 + POP_CEIL_PAD);
  });
  it('keeps sliding under a second row, and ignores a chip wholly below', () => {
    const row2 = { x: 720, y: 150, w: 120, h: 24 };
    expect(clearOfChips([[chip, row2], []], 750, 910, 142, 52)).toBe(150 + 24 + POP_CEIL_PAD);
    expect(clearOfChips([[{ x: 750, y: 400, w: 100, h: 24 }], []], 750, 910, 142, 52)).toBe(142);
  });
});
