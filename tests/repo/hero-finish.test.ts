import { describe, expect, it } from 'vitest';
import { finishFrame, HERO_PARAMS, ringMap } from '../../tools/assets/hero-finish';

const W = 40;
const H = 40;

/** Opaque disc (radius 12) of a flat colour in a transparent frame. */
function disc(rgb: readonly [number, number, number] = [90, 80, 70], r = 12): Uint8ClampedArray {
  const px = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const dx = x - 20;
      const dy = y - 20;
      if (dx * dx + dy * dy > r * r) continue;
      px.set([rgb[0], rgb[1], rgb[2], 255], (y * W + x) * 4);
    }
  return px;
}
const at = (px: ArrayLike<number>, x: number, y: number, c: number): number => px[(y * W + x) * 4 + c] as number;

describe('hero-finish', () => {
  it('leaves the deep interior byte-identical for A and B', () => {
    const src = disc();
    {
      const out = finishFrame(src, W, H, {});
      const ring = ringMap(Array.from({ length: W * H }, (_, k) => src[k * 4 + 3] as number), W, H, 128);
      for (let k = 0; k < W * H; k++) if ((ring[k] as number) >= 3) for (let c = 0; c < 4; c++) expect(out[k * 4 + c]).toBe(src[k * 4 + c]);
    }
  });

  it('keeps alpha and transparent pixels unchanged (non-ghost, no specks)', () => {
    const src = disc();
    const out = finishFrame(src, W, H, {});
    for (let k = 0; k < W * H; k++) {
      expect(out[k * 4 + 3]).toBe(src[k * 4 + 3]);
      if (src[k * 4 + 3] === 0) for (let c = 0; c < 3; c++) expect(out[k * 4 + c]).toBe(src[k * 4 + c]);
    }
  });

  it('lights the top edge more than the bottom, and left equal to right', () => {
    const out = finishFrame(disc(), W, H, { strength: 0.5 });
    expect(at(out, 20, 8, 2)).toBeGreaterThan(at(out, 20, 32, 2));
    expect(at(out, 8, 20, 2)).toBe(at(out, 32, 20, 2));
  });

  it('gives a darker pixel more rim', () => {
    const dark = finishFrame(disc([30, 30, 30]), W, H, { strength: 0.5 });
    const pale = finishFrame(disc([200, 200, 200]), W, H, { strength: 0.5 });
    // Share of the way to the (206,228,255) rim at the top edge pixel.
    expect((at(dark, 20, 8, 2) - 30) / (255 - 30)).toBeGreaterThan((at(pale, 20, 8, 2) - 200) / (255 - 200));
  });

  it('draws no rim on a frame border (cut edges)', () => {
    const px = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < H; y++) for (let x = 0; x < 10; x++) px.set([60, 60, 60, 255], (y * W + x) * 4);
    const out = finishFrame(px, W, H, { strength: 1 });
    expect(at(out, 0, 20, 2)).toBe(60); // left border, out-of-frame counts as solid
    expect(at(out, 9, 20, 2)).toBeGreaterThan(60); // the open side is lit
  });

  it('is deterministic and does not mutate its input', () => {
    const src = disc();
    const copy = new Uint8ClampedArray(src);
    const a = finishFrame(src, W, H, {});
    const b = finishFrame(src, W, H, {});
    expect(Array.from(a)).toEqual(Array.from(b));
    expect(Array.from(src)).toEqual(Array.from(copy));
  });

  it('removes specks and recolours the matte fringe', () => {
    const px = disc([200, 60, 40]);
    px.set([0, 0, 0, 5], (2 * W + 2) * 4); // speck
    px.set([255, 255, 255, 100], (20 * W + 7) * 4); // fringe pixel left of the disc (x=8 is its first opaque column)
    const out = finishFrame(px, W, H, { strength: 0 });
    expect(at(out, 2, 2, 3)).toBe(0);
    expect(at(out, 7, 20, 3)).toBe(100); // alpha kept
    expect(at(out, 7, 20, 0)).toBe(200); // colour from the solid neighbour
    expect(at(out, 7, 20, 1)).toBe(60);
  });

  it('ghost keeps alpha unless alphaLift is set; rings = 1 limits the rim to one px', () => {
    const src = disc();
    for (let k = 0; k < W * H; k++) if (src[k * 4 + 3] === 255) src[k * 4 + 3] = 140;
    expect(at(finishFrame(src, W, H, { ghost: true }), 20, 8, 3)).toBe(140);
    const g = finishFrame(src, W, H, { ghost: true, alphaLift: 0.5 });
    expect(at(g, 20, 8, 3)).toBeGreaterThan(140);
    expect(at(g, 20, 20, 3)).toBe(140);
    const one = finishFrame(disc(), W, H, { rings: 1, strength: 1 });
    expect(at(one, 20, 10, 2)).toBe(70); // ring 2 untouched
    expect(at(one, 20, 8, 2)).toBeGreaterThan(70);
  });

  it('avoidRed keeps the rim off red pixels and their neighbours', () => {
    const px = disc([90, 80, 70]);
    px.set([220, 40, 40, 255], (9 * W + 20) * 4);
    const out = finishFrame(px, W, H, { avoidRed: true, strength: 1 });
    expect(at(out, 20, 8, 2)).toBe(70);
    expect(at(out, 32, 20, 2)).toBeGreaterThan(70);
  });

  it('per-hero params follow the art-director verdict: no dark rim, treenoc 1 px', () => {
    for (const p of Object.values(HERO_PARAMS)) if (p.rim) expect((p.rim[0] + p.rim[1] + p.rim[2]) / 3).toBeGreaterThan(90);
    expect(HERO_PARAMS['treenoc']?.rings).toBe(1);
    expect(HERO_PARAMS['treenoc']?.lightenOnly).toBe(true);
    expect(HERO_PARAMS['rokcore']?.lightenOnly).toBe(true);
    expect(HERO_PARAMS['cyclonius']?.avoidRed).toBe(true);
  });

  it('lightenOnly never darkens a pixel and skips bodies below minBodyLuma', () => {
    const w = 12;
    const h = 12;
    const mk = (v: number): Uint8ClampedArray => {
      const a = new Uint8ClampedArray(w * h * 4);
      for (let y = 3; y < 9; y++) for (let x = 3; x < 9; x++) a.set([v, v, v, 255], (y * w + x) * 4);
      return a;
    };
    const rim: [number, number, number] = [200, 200, 200];
    const lum = (a: Uint8ClampedArray): number => a[(3 * w + 5) * 4] as number;
    expect(lum(finishFrame(mk(120), w, h, { rim, lightenOnly: true }))).toBeGreaterThan(120);
    expect(lum(finishFrame(mk(230), w, h, { rim, lightenOnly: true }))).toBe(230);
    expect(lum(finishFrame(mk(40), w, h, { rim, lightenOnly: true, minBodyLuma: 80 }))).toBe(40);
  });
});
