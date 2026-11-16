import { describe, expect, it } from 'vitest';
import { ARCADE_HERO_MAX_H, ARCADE_HERO_MIN_SCALE, ARCADE_HERO_SCALE, arcadeHeroScale, boxSpanX, clampSpanX, drawnBox, setFrameBox, visualBox, wallTuck, type BoxedImage, type Box } from './hero-scale';

describe('hero-scale', () => {
  it('scales a normal hero 2x and caps giants', () => {
    expect(arcadeHeroScale(80)).toBe(ARCADE_HERO_SCALE);
    expect(arcadeHeroScale(100) * 100).toBe(ARCADE_HERO_MAX_H);
    expect(arcadeHeroScale(320)).toBe(ARCADE_HERO_MIN_SCALE);
    expect(arcadeHeroScale(1000)).toBe(ARCADE_HERO_MIN_SCALE);
    expect(arcadeHeroScale(0)).toBe(ARCADE_HERO_SCALE);
  });
  it('grows the box about the feet centre', () => {
    const b = visualBox(100, 200, 40, 80, 2, { x: 0, y: 0, w: 0, h: 0 });
    expect(b).toEqual({ x: 80, y: 120, w: 80, h: 160 });
    expect(b.y + b.h).toBe(200 + 80);
    expect(b.x + b.w / 2).toBe(100 + 20);
  });
  it('tucks a drawn box inside the walls, by at most w(k-1)/2, and not at all at k = 1 or mid-world', () => {
    expect(wallTuck(-20, 80, 1920)).toBe(0);
    expect(wallTuck(1880 - 20, 80, 1920)).toBe(1840);
    expect(wallTuck(500, 80, 1920)).toBe(500);
    expect(visualBox(0, 200, 40, 80, 2, { x: 0, y: 0, w: 0, h: 0 }, 1920).x).toBe(0);
    expect(visualBox(1880, 200, 40, 80, 2, { x: 0, y: 0, w: 0, h: 0 }, 1920).x + 80).toBe(1920);
    expect(visualBox(0, 200, 40, 80, 1, { x: 0, y: 0, w: 0, h: 0 }, 1920).x).toBe(0);
    expect(visualBox(0, 200, 40, 80, 2, { x: 0, y: 0, w: 0, h: 0 }).x).toBe(-20);
    expect(wallTuck(5, 3000, 1920)).toBe(5);
  });
});

/** A bare stand-in for a drawn hero image: only the fields boxSpanX and drawnBox read. */
function fakeImg(o: Partial<{ x: number; flipX: boolean; dw: number; dh: number; fw: number; fh: number; box: Box }>): BoxedImage {
  const frame = { width: o.fw ?? 240, height: o.fh ?? 240, customData: {} };
  if (o.box) setFrameBox(frame, o.box);
  return { x: o.x ?? 0, y: 0, flipX: o.flipX ?? false, displayWidth: o.dw ?? 240, displayHeight: o.dh ?? 240, frame, setPosition: () => undefined, setDisplaySize: () => undefined };
}

describe('boxSpanX (WALL-3a)', () => {
  const box: Box = { x: 40, y: 20, w: 120, h: 180 };
  const out = { min: 0, max: 0 };
  it('at rotation 0 equals drawnBox, boxed and unboxed, flipped or not', () => {
    for (const flipX of [false, true]) {
      for (const boxed of [false, true]) {
        const img = fakeImg({ x: 100, flipX, dw: 480, dh: 480, ...(boxed ? { box } : {}) });
        const d = drawnBox(img, { x: 0, y: 0, w: 0, h: 0 });
        const s = boxSpanX(img, 0, out);
        expect(s.min).toBeCloseTo(d.x, 9);
        expect(s.max).toBeCloseTo(d.x + d.w, 9);
      }
    }
  });
  it('mirrors the box inside the frame with flipX', () => {
    const a = boxSpanX(fakeImg({ box }), 0, { min: 0, max: 0 });
    expect(a.min).toBe(40);
    expect(a.max).toBe(160);
    const b = boxSpanX(fakeImg({ box, flipX: true }), 0, { min: 0, max: 0 });
    expect(b.min).toBe(80);
    expect(b.max).toBe(200);
  });
  it('a lean moves the box corners by about h*sin(rot)', () => {
    const img = fakeImg({ x: 0, dw: 100, dh: 200 });
    const rot = 0.084;
    const s = boxSpanX(img, rot, out);
    // top-left corner (0,0) stays at x 0; the bottom corners swing left by h*sin; the right edge gains w*cos
    expect(s.min).toBeCloseTo(-200 * Math.sin(rot), 6);
    expect(s.max).toBeCloseTo(100 * Math.cos(rot), 6);
    const back = boxSpanX(img, -rot, out);
    expect(back.min).toBeCloseTo(0, 6);
    expect(back.max).toBeCloseTo(100 * Math.cos(rot) + 200 * Math.sin(rot), 6);
  });
  it('an unboxed frame spans the whole quad', () => {
    const s = boxSpanX(fakeImg({ x: 10, dw: 80, dh: 80 }), 0, out);
    expect([s.min, s.max]).toEqual([10, 90]);
  });
});

describe('clampSpanX (WALL-3a)', () => {
  it('leaves a span inside the room alone', () => {
    expect(clampSpanX(10, 90, 0, 1920)).toBe(0);
    expect(clampSpanX(0, 1920, 0, 1920)).toBe(0);
  });
  it('shifts right by the left spill and left by the right spill', () => {
    expect(clampSpanX(-14, 146, 0, 1920)).toBe(14);
    expect(clampSpanX(1780, 1934, 0, 1920)).toBe(-14);
  });
  it('does nothing for a span wider than the room', () => {
    expect(clampSpanX(-5, 2000, 0, 1920)).toBe(0);
  });
});
