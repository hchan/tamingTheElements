import { describe, expect, it } from 'vitest';
import { POP_LANE_PX, POP_NUMBER_CLEAR_PX, POP_MAX_LANES, popLaneLift } from './pop-lanes';

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
