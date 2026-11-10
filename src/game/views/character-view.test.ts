import { describe, expect, it } from 'vitest';
import { flipForDir, frameIndex, frameSetFor, lerp } from './character-view';

describe('character view helpers', () => {
  it('picks reels by facing and flips west-ish', () => {
    expect(frameSetFor(0)).toBe('right');
    expect(frameSetFor(4)).toBe('left');
    expect(frameSetFor(6)).toBe('up');
    expect(frameSetFor(2)).toBe('down');
    expect(flipForDir(4)).toBe(true);
    expect(flipForDir(0)).toBe(false);
  });
  it('animates only while moving', () => {
    expect(frameIndex(100, 4, false)).toBe(0);
    expect(frameIndex(6, 4, true)).toBe(1);
    expect(frameIndex(24, 4, true)).toBe(0);
    expect(frameIndex(5, 0, true)).toBe(0);
  });
  it('lerps', () => {
    expect(lerp(10, 20, 0.5)).toBe(15);
  });
});
