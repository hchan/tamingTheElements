// CPU-only silhouette rim for painted hero frames (hero contrast pass, Phase 1: candidates only, not wired into pack-sheets).
// Pure TypeScript, float multiply-add only (no sin/cos/pow/hypot), frame-local, deterministic, no Phaser or DOM.
// Art-director verdict 2026-11-19: variant A only (rim, no outline, no sharpening).
//
// finishFrame(rgba, w, h, params) returns a NEW buffer; the input is never mutated. Stages:
//   1. Tighten (non-ghosts): alpha < 12 -> 0; partial-alpha edge pixels take their colour from the opaque neighbours (no matte fringe).
//   2. Rim (ring 1 weight 1.0, ring 2 weight 0.4 unless rings = 1): blend toward the rim colour, key light from the top,
//      symmetric left/right (a runtime flip cannot swap sides); darker pixels get more. Pixels near an `avoid` colour get none.
// Interior pixels (> 2 px from the silhouette) are byte-identical. Out-of-frame counts as solid, so cut edges get no rim.

export type Rgb = readonly [number, number, number];

export interface FinishParams {
  /** Rim colour (0..255 per channel). Default: cool pale blue. */
  readonly rim?: Rgb;
  /** Rim strength 0..1 (default 0.35). */
  readonly strength?: number;
  /** Ghost (echo, wispera): no tightening. */
  readonly ghost?: boolean;
  /** Rim depth in px, 1 or 2 (default 2). */
  readonly rings?: 1 | 2;
  /** Share of missing opacity regained on ring 1 (default 0; alpha steps look blocky at 3x). */
  readonly alphaLift?: number;
  /** No rim within 3 px of a strongly red pixel (cyclonius eyes). */
  readonly avoidRed?: boolean;
  /** Rim only where it is lighter than the body pixel (never darkens an edge). */
  readonly lightenOnly?: boolean;
  /** With lightenOnly: skip body pixels darker than this luma (lightening them lands the edge on a mid-dark floor such as air). */
  readonly minBodyLuma?: number;
}

export const RIM_DEFAULT: Rgb = [206, 228, 255];
/** Per-hero parameters after the art-director verdict. Fiara and treenoc are reference only (runtime rim already applies). */
export const HERO_PARAMS: Readonly<Record<string, FinishParams>> = {
  lavax: { rim: [255, 242, 214] },
  ishimi: { rim: [214, 255, 176] },
  // Pale blue-white at lower strength; the dark rim made the pale body lose p10 on air.
  echo: { rim: [226, 240, 255], strength: 0.2, ghost: true },
  // Light desaturated stone, not dark, so the slate body keeps an edge on dark floors.
  rokcore: { rim: [200, 196, 184], strength: 0.4, lightenOnly: true, minBodyLuma: 45 },
  // Pale ochre to match the bark, about 30% weaker, 1 px: a reference look, not an outline.
  treenoc: { rim: [226, 192, 124], strength: 0.15, rings: 1, lightenOnly: true, minBodyLuma: 100 },
  // No dark rim: a faint blue glow, no alpha steps.
  wispera: { rim: [150, 190, 255], strength: 0.18, ghost: true, rings: 1 },
  pax: { rim: [226, 238, 255], strength: 0.45 },
  cyclonius: { avoidRed: true },
};
export const DEFAULT_STRENGTH = 0.35;
const SPECK_ALPHA = 12;
/** Silhouette mask: alpha at or above this is "inside" (ghosts are faint, so lower). */
const MASK_SOLID = 128;
const MASK_GHOST = 48;
/** Chamfer 3/4 distance limits for rings 1..3. */
const RING_MAX = [4, 8, 12] as const;
const INF = 1 << 20;

const luma = (r: number, g: number, b: number): number => ((299 * r + 587 * g + 114 * b) / 1000) | 0;
const clamp8 = (v: number): number => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));

/** Ring index per pixel: 0 = outside, 1..3 = that many px inside the silhouette, 4 = deeper. */
export function ringMap(alpha: ArrayLike<number>, w: number, h: number, threshold: number): Uint8Array {
  const d = new Int32Array(w * h);
  for (let i = 0; i < d.length; i++) d[i] = (alpha[i] ?? 0) >= threshold ? INF : 0;
  const relax = (x: number, y: number, dx: number, dy: number, c: number): void => {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= w || ny >= h) return; // out of frame is solid: no source of distance
    const v = (d[ny * w + nx] as number) + c;
    if (v < (d[y * w + x] as number)) d[y * w + x] = v;
  };
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      relax(x, y, -1, 0, 3);
      relax(x, y, 0, -1, 3);
      relax(x, y, -1, -1, 4);
      relax(x, y, 1, -1, 4);
    }
  for (let y = h - 1; y >= 0; y--)
    for (let x = w - 1; x >= 0; x--) {
      relax(x, y, 1, 0, 3);
      relax(x, y, 0, 1, 3);
      relax(x, y, 1, 1, 4);
      relax(x, y, -1, 1, 4);
    }
  const out = new Uint8Array(w * h);
  for (let i = 0; i < out.length; i++) {
    const v = d[i] as number;
    out[i] = v === 0 ? 0 : v <= RING_MAX[0] ? 1 : v <= RING_MAX[1] ? 2 : v <= RING_MAX[2] ? 3 : 4;
  }
  return out;
}

export function finishFrame(rgba: ArrayLike<number>, w: number, h: number, p: FinishParams = {}): Uint8ClampedArray {
  if (rgba.length !== w * h * 4) throw new Error(`finishFrame: ${String(rgba.length)} bytes for ${String(w)}x${String(h)}`);
  const out = new Uint8ClampedArray(rgba.length);
  for (let i = 0; i < out.length; i++) out[i] = rgba[i] as number;
  const ghost = p.ghost === true;
  const rim = p.rim ?? RIM_DEFAULT;
  const strength = p.strength ?? DEFAULT_STRENGTH;
  const rings = p.rings ?? 2;
  const lift = p.alphaLift ?? 0;

  // 1. Tighten.
  if (!ghost) {
    const solid = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < w && y < h && (rgba[(y * w + x) * 4 + 3] as number) >= 200;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const a = rgba[i + 3] as number;
        if (a === 0) continue;
        if (a < SPECK_ALPHA) {
          out[i + 3] = 0;
          continue;
        }
        if (a >= 200) continue;
        let n = 0;
        let r = 0;
        let g = 0;
        let b = 0;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            if ((dx === 0 && dy === 0) || !solid(x + dx, y + dy)) continue;
            const j = ((y + dy) * w + x + dx) * 4;
            r += rgba[j] as number;
            g += rgba[j + 1] as number;
            b += rgba[j + 2] as number;
            n++;
          }
        if (n > 0) {
          out[i] = Math.round(r / n);
          out[i + 1] = Math.round(g / n);
          out[i + 2] = Math.round(b / n);
        }
      }
  }

  const alpha = new Uint8Array(w * h);
  for (let i = 0; i < alpha.length; i++) alpha[i] = out[i * 4 + 3] as number;
  const ring = ringMap(alpha, w, h, ghost ? MASK_GHOST : MASK_SOLID);
  const opaque = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < w && y < h && (ring[y * w + x] as number) > 0;
  const red = (x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x >= w || y >= h || (out[(y * w + x) * 4 + 3] as number) < MASK_SOLID) return false;
    const i = (y * w + x) * 4;
    return (out[i] as number) > 140 && (out[i + 1] as number) < 100 && (out[i + 2] as number) < 100;
  };
  const nearRed = (x: number, y: number): boolean => {
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) if (red(x + dx, y + dy)) return true;
    return false;
  };

  // 2. Rim, from the tightened source colours.
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const k = y * w + x;
      const r = ring[k] as number;
      if (r === 0 || r > rings) continue;
      // Key light: strongest where the nearest outside pixel is above, then level, then below. Left == right by construction.
      let dir = 0;
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h || opaque(nx, ny)) continue;
          const f = dy < 0 ? 1 : dy === 0 ? 0.7 : 0.45;
          if (f > dir) dir = f;
        }
      if (dir === 0) continue;
      if (p.avoidRed === true && nearRed(x, y)) continue;
      const i = k * 4;
      const cr = out[i] as number;
      const cg = out[i + 1] as number;
      const cb = out[i + 2] as number;
      if (p.lightenOnly === true && luma(rim[0], rim[1], rim[2]) <= luma(cr, cg, cb)) continue;
      if (p.lightenOnly === true && luma(cr, cg, cb) < (p.minBodyLuma ?? 0)) continue;
      const body = 0.55 + 0.45 * (1 - luma(cr, cg, cb) / 255);
      const t = Math.min(1, strength * (r === 1 ? 1 : 0.4) * dir * body);
      out[i] = clamp8(cr + (rim[0] - cr) * t);
      out[i + 1] = clamp8(cg + (rim[1] - cg) * t);
      out[i + 2] = clamp8(cb + (rim[2] - cb) * t);
      if (lift > 0 && r === 1) out[i + 3] = clamp8((out[i + 3] as number) + (255 - (out[i + 3] as number)) * lift);
    }
  return out;
}
