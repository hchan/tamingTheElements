import type Phaser from 'phaser';

/**
 * Shared "grim" look for the runtime-drawn effects (owner: the new art read as too cartoony). No bold black outlines, no flat
 * saturated fills, no white pop lines: a dark smoky underlay, layered soft additive glows, muted colour, and drifting embers.
 * The shapes themselves are unchanged, so each effect stays shape-coded. Pure helpers plus two Graphics painters.
 */

const ADD = 1; // Phaser.BlendModes.ADD (numeric, so this file needs no runtime Phaser import)

/** Pulls a 0xRRGGBB colour toward its own grey and darkens it: the same grade as the baked sprite strips. */
export function mute(color: number, keep = 0.62, dark = 0.9): number {
  const r = (color >> 16) & 255;
  const g = (color >> 8) & 255;
  const b = color & 255;
  const y = r * 0.3 + g * 0.59 + b * 0.11;
  const f = (c: number): number => Math.min(255, Math.max(0, Math.round((y + (c - y) * keep) * dark)));
  return (f(r) << 16) | (f(g) << 8) | f(b);
}

/** Icon grade, in place over RGBA bytes: pulls every pixel toward its grey, darkens it and adds a little deterministic grain (alpha untouched). */
export function gradeRgba(px: Uint8ClampedArray | number[], keep = 0.5, dark = 0.86, grain = 6): void {
  for (let i = 0; i + 3 < px.length; i += 4) {
    const r = px[i] ?? 0;
    const g = px[i + 1] ?? 0;
    const b = px[i + 2] ?? 0;
    const y = r * 0.3 + g * 0.59 + b * 0.11;
    const n = (hash01(i >> 2, 11) - 0.5) * 2 * grain;
    px[i] = Math.min(255, Math.max(0, (y + (r - y) * keep) * dark + n));
    px[i + 1] = Math.min(255, Math.max(0, (y + (g - y) * keep) * dark + n));
    px[i + 2] = Math.min(255, Math.max(0, (y + (b - y) * keep) * dark + n));
  }
}

export interface Ember {
  readonly x: number;
  readonly y: number;
  readonly r: number;
  readonly a: number;
}

/** Cheap integer hash to 0..1 (no Math.random: a still frame stays still, and reduced motion is exactly static). */
export function hash01(i: number, salt: number): number {
  let h = Math.imul(i + 1, 0x9e3779b1) ^ Math.imul(salt + 7, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
}

/**
 * Embers/ash scattered in a disc of `radius` around (cx, cy), drifting up and fading as they go. `age` view ticks; reduced
 * motion freezes them at a mid-life pose (still visible, no movement). Fade in/out is per ember so the cloud never pops.
 */
export function embers(cx: number, cy: number, radius: number, age: number, reduced: boolean, count: number, salt = 0): Ember[] {
  const out: Ember[] = [];
  for (let i = 0; i < count; i++) {
    const life = reduced ? 0.5 : ((age * (0.011 + hash01(i, salt) * 0.012) + hash01(i, salt + 1)) % 1);
    const ang = hash01(i, salt + 2) * Math.PI * 2;
    const d = Math.sqrt(hash01(i, salt + 3)) * radius;
    out.push({
      x: cx + Math.cos(ang) * d + (reduced ? 0 : Math.sin(age * 0.05 + i) * 3),
      y: cy + Math.sin(ang) * d * 0.7 - life * radius * 0.45,
      r: 0.8 + hash01(i, salt + 4) * 1.6,
      a: Math.sin(life * Math.PI) * 0.7,
    });
  }
  return out;
}

type Gfx = Phaser.GameObjects.Graphics;
type Pt = Phaser.Math.Vector2;

export function toPts(pts: readonly number[]): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i + 1 < pts.length; i += 2) out.push({ x: pts[i] ?? 0, y: pts[i + 1] ?? 0 } as Pt);
  return out;
}

/** A pair of Graphics: `under` (normal blend, smoky shadow) and `glow` (additive light), both cleared each frame. */
export function glowPair(under: Gfx, glow: Gfx): { under: Gfx; glow: Gfx } {
  glow.setBlendMode(ADD);
  return { under, glow };
}

/**
 * One soft stroke: a wide dark smudge under it, then additive glow passes of falling width and rising strength, then a thin
 * dim core line in the muted colour (never white, never opaque black).
 */
export function softStroke(p: { under: Gfx; glow: Gfx }, pts: readonly Pt[], closed: boolean, color: number, alpha: number, scale = 1): void {
  p.under.lineStyle(14 * scale, 0x000000, 0.16 * alpha).strokePoints(pts as Pt[], closed);
  p.under.lineStyle(6 * scale, 0x000000, 0.2 * alpha).strokePoints(pts as Pt[], closed);
  p.glow.lineStyle(16 * scale, color, 0.035 * alpha).strokePoints(pts as Pt[], closed);
  p.glow.lineStyle(9 * scale, color, 0.07 * alpha).strokePoints(pts as Pt[], closed);
  p.glow.lineStyle(4 * scale, color, 0.14 * alpha).strokePoints(pts as Pt[], closed);
  p.glow.lineStyle(1.5 * scale, mute(color, 0.5, 1.15), 0.3 * alpha).strokePoints(pts as Pt[], closed);
}

/** A soft fill: the polygon stacked at shrinking scales about its centre, each a faint layer, so the middle reads denser. */
export function softFill(g: Gfx, pts: readonly number[], color: number, alpha: number): void {
  let cx = 0;
  let cy = 0;
  const n = pts.length / 2;
  for (let i = 0; i + 1 < pts.length; i += 2) {
    cx += pts[i] ?? 0;
    cy += pts[i + 1] ?? 0;
  }
  cx /= n;
  cy /= n;
  for (const s of [1, 0.78, 0.56, 0.34]) {
    const sc: number[] = [];
    for (let i = 0; i + 1 < pts.length; i += 2) sc.push(cx + ((pts[i] ?? 0) - cx) * s, cy + ((pts[i + 1] ?? 0) - cy) * s);
    g.fillStyle(color, 0.07 * alpha).fillPoints(toPts(sc), true);
  }
}

export function paintEmbers(g: Gfx, list: readonly Ember[], color: number, alpha: number): void {
  for (const e of list) {
    g.fillStyle(color, e.a * alpha * 0.5).fillCircle(e.x, e.y, e.r * 2.2);
    g.fillStyle(mute(color, 0.5, 1.2), e.a * alpha).fillCircle(e.x, e.y, e.r);
  }
}
