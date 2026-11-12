import { describe, expect, it } from 'vitest';
import { TRAP_BLINK_TICKS, TRAP_COLORS, TRAP_RANGE_PX, TRAP_WORDS, trapAlpha, trapLabel } from './trap-fx';

describe('trapLabel', () => {
  it('names the kind and the owner in words, and says "arming" until armed', () => {
    expect(trapLabel(1, 0, 0)).toBe('P1 Fire Bomb');
    expect(trapLabel(2, 1, 12)).toBe('P2 Puddle (arming)');
    expect(trapLabel(3, 0, 0)).toBe('P1 Spike');
    expect(trapLabel(4, 1, 0)).toBe('P2 Gust');
  });
  it('is empty for a free slot or an unknown kind', () => {
    expect(trapLabel(0, 0, 0)).toBe('');
    expect(trapLabel(9, 0, 0)).toBe('');
  });
  it('every kind has a distinct word and colour', () => {
    expect(new Set(TRAP_WORDS.slice(1)).size).toBe(4);
    expect(new Set(TRAP_COLORS.slice(1)).size).toBe(4);
  });
});

describe('trapAlpha', () => {
  it('is dim while arming, full when armed', () => {
    expect(trapAlpha(5, 300, 0, false)).toBe(0.5);
    expect(trapAlpha(0, 300, 0, false)).toBe(1);
  });
  it('blinks near the end of its life, and holds steady under reduced motion', () => {
    const seen = new Set([0, 5, 10].map((t) => trapAlpha(0, TRAP_BLINK_TICKS, t, false)));
    expect(seen.size).toBe(2);
    expect([0, 5, 10].every((t) => trapAlpha(0, 3, t, true) === 1)).toBe(true);
    expect(trapAlpha(0, TRAP_BLINK_TICKS + 1, 5, false)).toBe(1);
  });
  it('the range square is the box plus the trigger margin on both sides', () => {
    expect(TRAP_RANGE_PX).toBe(56 + 48);
  });
});
