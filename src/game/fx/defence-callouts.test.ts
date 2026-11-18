import { describe, expect, it } from 'vitest';
import { type Box, EASE_TAU_MS, calloutOverlaps, clearAbove, dropBelow, easeTo, easeUp, overlapsAny, slideClear } from './defence-callouts';

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
    expect(args(130, { anchor: 300, max: 60 })).toBe(130); // 82 is 218 and 218 is 82 from the anchor
  });
  it('rejects a candidate that hits another rect', () => {
    expect(args(130, { rects: [r, rect(0, 100, 92, 50)] })).toBe(218);
  });
  it('returns cx when nothing fits', () => {
    expect(args(130, { xLo: 100, xHi: 200 })).toBe(130);
  });
});

describe('easeUp / easeTo', () => {
  /** Frames of `dt` ms until the gap is under 5% (95% done); the ease never overshoots or goes backwards on the way. */
  const msTo95 = (dt: number): number => {
    let shown = 0;
    let ms = 0;
    while (shown < 28.5 && ms < 1000) {
      const next = easeUp(shown, 30, dt, false);
      expect(next).toBeGreaterThanOrEqual(shown);
      expect(next).toBeLessThanOrEqual(30);
      shown = next;
      ms += dt;
    }
    return ms;
  };
  it('finishes about 95% in 105 ms at 60 and at 144 Hz', () => {
    expect(EASE_TAU_MS).toBe(35);
    expect(Math.abs(msTo95(1000 / 60) - 105)).toBeLessThan(17);
    expect(Math.abs(msTo95(1000 / 144) - 105)).toBeLessThan(8);
  });
  it('snaps when reduced, on a first frame (snap) and under half a pixel', () => {
    expect(easeUp(0, 30, 16, true)).toBe(30);
    expect(easeTo(5, 40, 16, true)).toBe(40);
    expect(easeUp(29.6, 30, 16, false)).toBe(30);
  });
  it('drops are instant and zero time does not move', () => {
    expect(easeUp(30, 0, 16, false)).toBe(0);
    expect(easeUp(0, 30, 0, false)).toBe(0);
  });
  it('easeTo also eases a slide to the left without overshoot', () => {
    const x = easeTo(100, 40, 16, false);
    expect(x).toBeLessThan(100);
    expect(x).toBeGreaterThan(40);
  });
});

describe('dropBelow', () => {
  it('leaves a clear call-out alone', () => { expect(dropBelow(150, 300, 10, 10, [rect(900, 290)], 8, 400)).toBe(300); });
  it('moves under the rect it overlaps by gap', () => { expect(dropBelow(150, 120, 10, 10, [rect(100, 100)], 8, 400)).toBe(100 + 50 + 8 + 10); });
  it('never goes lower than maxBottom', () => { expect(dropBelow(150, 120, 10, 10, [rect(100, 100)], 8, 150)).toBe(120); });
  it('clears a stack of rects in a few passes', () => {
    expect(dropBelow(150, 120, 10, 10, [rect(100, 100, 100, 50), rect(100, 158, 100, 50)], 8, 500)).toBe(158 + 50 + 8 + 10);
  });
});

describe('pinned call-outs avoid each other', () => {
  it('three ceiling-pinned call-outs and two pops end clear when the stack is placed obstacle by obstacle', () => {
    // The ceiling pins every call-out at bottom 132 (h 30); each one placed joins the obstacles, then slides or drops.
    const obst: Box[] = [rect(100, 100, 60, 30), rect(300, 100, 60, 30)];
    const placed: Box[] = [];
    for (let k = 0; k < 3; k++) {
      let bottom = 132;
      let cx = 230;
      if (overlapsAny(cx, bottom, 40, 30, obst, 8)) cx = slideClear(cx, bottom, 40, 30, obst, 8, 0, 1280, 200, 640, 230);
      if (overlapsAny(cx, bottom, 40, 30, obst, 8)) bottom = dropBelow(cx, bottom, 40, 30, obst, 8, 400);
      expect(overlapsAny(cx, bottom, 40, 30, obst, 8)).toBe(false);
      const b = { x: cx - 40, y: bottom - 30, w: 80, h: 30 };
      placed.push(b);
      obst.push(b);
    }
    for (let a = 0; a < placed.length; a++) for (let b = a + 1; b < placed.length; b++) {
      expect(calloutOverlaps((placed[a] as Box).x + 40, (placed[a] as Box).y + 30, 40, 30, placed[b] as Box, 0)).toBe(false);
    }
  });
});
