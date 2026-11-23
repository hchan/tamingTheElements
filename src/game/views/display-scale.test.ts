import { describe, expect, it } from 'vitest';
import { DISPLAY_SCALE, displayScaleOf } from './display-scale';

describe('display scale', () => {
  it('makes Zephra about 10-15% larger', () => {
    expect(DISPLAY_SCALE['zephra']).toBe(1.15);
    expect(displayScaleOf('zephra')).toBeGreaterThanOrEqual(1.1);
    expect(displayScaleOf('zephra')).toBeLessThanOrEqual(1.15);
  });
  it('leaves every other hero at 1', () => {
    for (const n of ['fiara', 'abyssor', 'treenoc', 'wispera']) expect(displayScaleOf(n)).toBe(1);
    expect(Object.keys(DISPLAY_SCALE)).toEqual(['zephra']);
  });
});
