import { describe, expect, it } from 'vitest';
import { linkLine, linkQuality } from './link-quality';

describe('link quality words', () => {
  it('grades by round trip', () => {
    expect(linkQuality(48)).toBe('good');
    expect(linkQuality(99)).toBe('good');
    expect(linkQuality(100)).toBe('fair');
    expect(linkQuality(199)).toBe('fair');
    expect(linkQuality(200)).toBe('poor');
  });

  it('the worse of round trip and stall share wins', () => {
    expect(linkQuality(30, { updates: 1000, stalls: 5 })).toBe('good');
    expect(linkQuality(30, { updates: 1000, stalls: 10 })).toBe('fair');
    expect(linkQuality(30, { updates: 1000, stalls: 50 })).toBe('poor');
    expect(linkQuality(150, { updates: 0, stalls: 0 })).toBe('fair');
  });

  it('the line has words and a rounded number, and a placeholder before the first pong', () => {
    expect(linkLine(48.4)).toBe('Link: good, 48 ms');
    expect(linkLine(250, { updates: 10, stalls: 0 })).toBe('Link: poor, 250 ms');
    expect(linkLine(undefined)).toBe('Link: measuring...');
  });
});
