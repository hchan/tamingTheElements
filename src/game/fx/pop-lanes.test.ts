import { describe, expect, it } from 'vitest';
import { POP_CEIL_FLOOR, POP_CEIL_PAD, POP_LANE_PX, POP_NUMBER_CLEAR_PX, POP_MAX_LANES, popCeil, popLaneLift } from './pop-lanes';
import { SCRIM_BOTTOM } from '../hud/slim-hud';

describe('popLaneLift', () => {
  it('does not lift the first pop', () => {
    expect(popLaneLift([], 100, 100)).toBe(0);
  });
  it('lifts one lane per live pop nearby', () => {
    expect(popLaneLift([{ x: 100, y: 100 }], 110, 95)).toBe(POP_LANE_PX);
    expect(popLaneLift([{ x: 100, y: 100 }, { x: 105, y: 90 }], 100, 100)).toBe(2 * POP_LANE_PX);
  });
  it('ignores pops over the other fighter', () => {
    expect(popLaneLift([{ x: 700, y: 100 }], 100, 100)).toBe(0);
  });
  it('caps the lift', () => {
    const live = Array.from({ length: 8 }, () => ({ x: 100, y: 100 }));
    expect(popLaneLift(live, 100, 100)).toBe(POP_MAX_LANES * POP_LANE_PX);
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
