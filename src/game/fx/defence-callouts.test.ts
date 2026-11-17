import { describe, expect, it } from 'vitest';
import { type Box, calloutOverlaps, clearAbove, overlapsAny, slideClear } from './defence-callouts';

const rect = (x: number, y: number, w = 100, h = 50): Box => ({ x, y, w, h });

describe('calloutOverlaps', () => {
  it('counts a touch, not exactly `gap` apart', () => {
    const r = rect(100, 100);
    // call-out 20 wide x 10 tall, gap 8, the rect starts at y 100.
    expect(calloutOverlaps(150, 93, 10, 10, r, 8)).toBe(true);
    expect(calloutOverlaps(150, 92, 10, 10, r, 8)).toBe(false); // bottom + gap == r.y
    expect(calloutOverlaps(150, 93, 10, 10, r, 8)).toBe(true);
    expect(calloutOverlaps(82, 120, 10, 10, r, 8)).toBe(false); // cx + halfW + gap == r.x
    expect(calloutOverlaps(83, 120, 10, 10, r, 8)).toBe(true);
  });
  it('overlapsAny scans all rects', () => {
    expect(overlapsAny(0, 0, 5, 5, [], 8)).toBe(false);
    expect(overlapsAny(150, 120, 10, 10, [rect(0, 500), rect(100, 100)], 8)).toBe(true);
  });
});

describe('clearAbove', () => {
  it('leaves a free call-out alone', () => { expect(clearAbove(150, 300, 10, 10, [], 8)).toBe(300); });
  it('ignores a far rect', () => { expect(clearAbove(150, 300, 10, 10, [rect(900, 290)], 8)).toBe(300); });
  it('lifts above one rect to r.y - gap', () => { expect(clearAbove(150, 140, 10, 10, [rect(100, 100)], 8)).toBe(92); });
  it('clears stacked rects in either order', () => {
    const a = rect(100, 100, 100, 30);
    const b = rect(100, 60, 100, 30);
    expect(clearAbove(150, 140, 10, 10, [a, b], 8)).toBe(52);
    expect(clearAbove(150, 140, 10, 10, [b, a], 8)).toBe(52);
  });
  it('terminates with many rects', () => {
    const rects: Box[] = [];
    for (let i = 0; i < 40; i++) rects.push(rect(100, i * 12, 100, 12));
    const out = clearAbove(150, 480, 10, 10, rects, 8);
    expect(overlapsAny(150, out, 10, 10, rects, 8)).toBe(false);
  });
});

describe('slideClear', () => {
  const r = rect(100, 100); // x 100..200
  const args = (cx: number, o: Partial<{ rects: Box[]; xLo: number; xHi: number; max: number; centre: number; anchor: number }> = {}): number =>
    slideClear(cx, 120, 10, 10, o.rects ?? [r], 8, o.xLo ?? 0, o.xHi ?? 1000, o.max ?? 120, o.centre ?? 500, o.anchor ?? cx);
  it('picks the nearest side', () => {
    expect(args(130)).toBe(82); // left edge 100 - 8 - 10
    expect(args(170)).toBe(218); // right edge 200 + 8 + 10
  });
  it('breaks ties toward the centre', () => {
    expect(args(150, { centre: 900 })).toBe(218);
    expect(args(150, { centre: 0 })).toBe(82);
  });
  it('respects xLo and xHi', () => {
    expect(args(130, { xLo: 100 })).toBe(218);
    expect(args(170, { xHi: 200 })).toBe(82);
  });
  it('measures maxSlide from the anchor, not cx', () => {
    expect(args(130, { anchor: 130, max: 60 })).toBe(82);
    expect(args(130, { anchor: 300, max: 100 })).toBe(130); // 82 is 218 from the anchor
  });
  it('rejects a candidate that hits another rect', () => {
    expect(args(130, { rects: [r, rect(0, 100, 92, 50)] })).toBe(218);
  });
  it('returns cx when nothing fits', () => {
    expect(args(130, { xLo: 100, xHi: 200 })).toBe(130);
  });
});
