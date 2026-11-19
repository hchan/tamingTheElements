import { describe, expect, it } from 'vitest';
import { TRAP_BLINK_TICKS, TRAP_COLORS, TRAP_DECAL_HALF_PX, TRAP_RANGE_PX, TRAP_WORDS, WALL_MARGIN, labelX, trapAlpha, trapLabel, trapPhase, trapRangeDashes } from './trap-fx';
import { TRAP_DECAL_R } from './trap-paint';
import { clampSpanX } from '../views/hero-scale';

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

describe('trapPhase', () => {
  it('shows arming progress, then 1 once armed', () => {
    expect(trapPhase(30, 200, 0, false).arm).toBe(0);
    expect(trapPhase(15, 200, 0, false).arm).toBeCloseTo(0.5);
    expect(trapPhase(0, 200, 0, false).arm).toBe(1);
  });
  it('urgency rises over the last blink window and is 0 under reduced motion', () => {
    expect(trapPhase(0, TRAP_BLINK_TICKS + 5, 0, false).urgency).toBe(0);
    expect(trapPhase(0, 0, 0, false).urgency).toBe(1);
    expect(trapPhase(0, 0, 0, true).urgency).toBe(0);
  });
  it('freezes the clock under reduced motion', () => {
    expect(trapPhase(0, 100, 10, true).t).toBe(trapPhase(0, 100, 900, true).t);
    expect(trapPhase(0, 100, 10, false).t).not.toBe(trapPhase(0, 100, 900, false).t);
  });
});

describe('trapRangeDashes (wall cut)', () => {
  const rx = TRAP_RANGE_PX / 2;
  it('mid-arena is the usual 24 dashes (96 segments)', () => {
    const d = trapRangeDashes(960, 400, 0, 1920);
    expect(d.length).toBe(24 * 4);
  });
  it('at the left wall nothing is left of the wall inset and a wall line closes the ring', () => {
    const cx = 28; // box x 0, centre 28
    const d = [...trapRangeDashes(cx, 380, 0, 1920)];
    const xs = d.filter((_, i) => i % 2 === 0);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(3);
    const wall: number[][] = [];
    for (let i = 0; i < d.length; i += 4) if (d[i] === 3 && d[i + 2] === 3) wall.push(d.slice(i, i + 4));
    expect(wall.length).toBeGreaterThan(0);
    const half = rx * 0.6 + WALL_MARGIN; // the full ring height plus a margin, so the line is longer than the ring is tall
    expect(wall.length).toBe(1);
    expect(Math.min(...wall.map((s) => s[1] ?? 0))).toBeCloseTo(380 - half, 5);
    expect(Math.max(...wall.map((s) => s[3] ?? 0))).toBeCloseTo(380 + half, 5);
  });
  it('the right wall mirrors the left', () => {
    const l = [...trapRangeDashes(28, 380, 0, 1920)];
    const r = [...trapRangeDashes(1920 - 28, 380, 0, 1920)];
    expect(r.length).toBe(l.length);
    const xs = r.filter((_, i) => i % 2 === 0);
    expect(Math.max(...xs)).toBeLessThanOrEqual(1917);
    expect(r.some((v, i) => i % 4 === 0 && v === 1917 && r[i + 2] === 1917)).toBe(true);
  });
  it('is the same shared array between calls (no allocation)', () => {
    expect(trapRangeDashes(500, 300, 0, 1920)).toBe(trapRangeDashes(900, 300, 0, 1920));
  });
});

describe('decal tuck and label clamp', () => {
  it('tucks the decal by at most 7 px at a wall and not at all mid-arena', () => {
    expect(clampSpanX(28 - 35, 28 + 35, 0, 1920)).toBe(7);
    expect(clampSpanX(1892 - 35, 1892 + 35, 0, 1920)).toBe(-7);
    expect(clampSpanX(960 - 35, 960 + 35, 0, 1920)).toBe(0);
  });
  it('labelX keeps the label inside and leaves a mid-arena label alone', () => {
    expect(labelX(28, 120, 0, 1920)).toBe(64);
    expect(labelX(1892, 120, 0, 1920)).toBe(1856);
    expect(labelX(960, 120, 0, 1920)).toBe(960);
  });
  it('the half width covers the painted radius with its soft edge', () => {
    expect(TRAP_DECAL_HALF_PX).toBeGreaterThanOrEqual(Math.max(TRAP_DECAL_R * 1.1, TRAP_DECAL_R + 3.5));
  });
});
