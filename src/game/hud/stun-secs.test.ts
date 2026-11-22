import { describe, expect, it } from 'vitest';
import { stunSecs, stunWord } from './stun-secs';

describe('stunSecs / stunWord', () => {
  it('shows tenths of a second, rounded up (50 ticks per second)', () => {
    expect(stunSecs(30)).toBe('0.6s');
    expect(stunSecs(1)).toBe('0.1s');
    expect(stunSecs(50)).toBe('1.0s');
    expect(stunSecs(51)).toBe('1.1s');
    expect(stunSecs(150)).toBe('3.0s');
  });
  it('keeps the bare word when no stun time is left', () => {
    expect(stunWord('STUN', 30)).toBe('STUN 0.6s');
    expect(stunWord('STUN', 0)).toBe('STUN');
    expect(stunWord('STUN', -4)).toBe('STUN');
  });
});
