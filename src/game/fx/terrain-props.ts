import type Phaser from 'phaser';
import { hash01, toPts } from './grim-fx';

/**
 * Earth-stage obstacles drawn as props, not boxes (owner: the rocks were brick placeholders). Each rock patch is a boulder,
 * a broken pillar or a crystal cluster, chosen from the patch's shape and index, lit from the upper left, with a contact
 * shadow, cracks and a little moss. Everything stays inside the sim's footprint (the shadow trails off it a few pixels) and
 * is a pure function of (rect, index): static, drawn once per layout, deterministic, no text. Painterly and luminous (qa-r6: warm lit stone, tonal soft edges instead of black outlines).
 */
type Gfx = Phaser.GameObjects.Graphics;

const ch = (c: number, k: number): number => {
  const f = (v: number): number => Math.min(255, Math.max(0, Math.round(v * k)));
  return (f((c >> 16) & 255) << 16) | (f((c >> 8) & 255) << 8) | f(c & 255);
};

/** The prop kinds, picked by `propKind`. */
export type PropKind = 'boulder' | 'pillar' | 'crystal';

/** A tall narrow footprint is a pillar, a squat wide one a boulder, a squarish one alternates boulder and crystal by index. */
export function propKind(w: number, h: number, i: number): PropKind {
  if (h >= w * 1.25) return 'pillar';
  if (w >= h * 1.25) return 'boulder';
  return i % 2 === 0 ? 'crystal' : 'boulder';
}

const STONE = 0x9a8c72; // qa-r6: warm sunlit sandstone, brighter than the old grey so props sit in the painted floor
const MOSS = 0x5d7440;

function shadow(g: Gfx, x: number, y: number, w: number, h: number): void {
  for (const [k, a] of [[1, 0.1], [0.86, 0.13], [0.7, 0.17]] as const) {
    g.fillStyle(0x000000, a).fillEllipse(x + w * 0.54, y + h * 0.9, w * 1.02 * k, h * 0.34 * k + 4);
  }
}

function moss(g: Gfx, cx: number, cy: number, rx: number, seed: number): void {
  for (let k = 0; k < 5; k++) {
    const px = cx + (hash01(k, seed) - 0.5) * rx * 2;
    const py = cy + (hash01(k, seed + 1) - 0.5) * rx * 0.5;
    g.fillStyle(MOSS, 0.55).fillEllipse(px, py, 6 + hash01(k, seed + 2) * 10, 3 + hash01(k, seed + 3) * 4);
  }
}

function crack(g: Gfx, x0: number, y0: number, x1: number, y1: number, seed: number): void {
  const pts: number[] = [x0, y0];
  for (let s = 1; s <= 4; s++) pts.push(x0 + ((x1 - x0) * s) / 4 + (hash01(s, seed) - 0.5) * 8, y0 + ((y1 - y0) * s) / 4 + (hash01(s, seed + 1) - 0.5) * 8);
  g.lineStyle(1.5, 0x3a2e22, 0.4).strokePoints(toPts(pts), false);
}

function boulder(g: Gfx, x: number, y: number, w: number, h: number, seed: number): void {
  const cx = x + w / 2;
  const cy = y + h * 0.5;
  const n = 12;
  const pts: number[] = [];
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    const j = 0.86 + hash01(k, seed) * 0.14;
    // A squircle that fills the footprint, flatter at the bottom so it sits on the floor.
    const c = Math.cos(a);
    const s = Math.sin(a);
    pts.push(cx + (w / 2) * Math.sign(c) * Math.abs(c) ** 0.7 * j, cy + (h / 2) * Math.sign(s) * Math.abs(s) ** 0.7 * j * (s > 0 ? 0.92 : 1));
  }
  // Facets: triangles fanned from a highlight point toward the upper left, shaded by how they face the light.
  const hx = cx - w * 0.14;
  const hy = cy - h * 0.2;
  for (let k = 0; k < n; k++) {
    const k2 = (k + 1) % n;
    const mx = ((pts[k * 2] ?? 0) + (pts[k2 * 2] ?? 0)) / 2 - cx;
    const my = ((pts[k * 2 + 1] ?? 0) + (pts[k2 * 2 + 1] ?? 0)) / 2 - cy;
    const l = Math.hypot(mx, my) || 1;
    const lit = (-mx - my) / (l * 1.41421);
    const f = 0.62 + 0.5 * (lit * 0.5 + 0.5) + (hash01(k, seed + 7) - 0.5) * 0.14;
    g.fillStyle(ch(STONE, f), 1).fillTriangle(hx, hy, pts[k * 2] ?? 0, pts[k * 2 + 1] ?? 0, pts[k2 * 2] ?? 0, pts[k2 * 2 + 1] ?? 0);
  }
  g.lineStyle(1, 0x4a3c2c, 0.18);
  for (let k = 0; k < n; k++) g.lineBetween(hx, hy, pts[k * 2] ?? 0, pts[k * 2 + 1] ?? 0);
  g.lineStyle(2, ch(STONE, 0.5), 0.35).strokePoints(toPts(pts), true); // qa-r6: soft tonal edge, no black outline
  g.lineStyle(1.5, ch(STONE, 1.6), 0.35).lineBetween(pts[22] ?? cx, pts[23] ?? cy, pts[0] ?? cx, pts[1] ?? cy);
  crack(g, cx + w * 0.1, cy - h * 0.3, cx + w * 0.2, cy + h * 0.25, seed + 31);
  crack(g, cx - w * 0.25, cy + h * 0.05, cx - w * 0.05, cy + h * 0.3, seed + 41);
  moss(g, cx - w * 0.15, cy - h * 0.28, w * 0.3, seed + 51);
}

function pillar(g: Gfx, x: number, y: number, w: number, h: number, seed: number): void {
  // A tapering rock spire (not a drum: round ribbed shafts read as bins): faceted planes meeting on a leaning ridge, strata
  // cut across them, a jagged broken top and a vein of cold crystal shards, so it reads as rock first.
  const bot = y + h - 4;
  const topY = y + 2 + hash01(0, seed) * 6;
  const peakX = x + w * (0.36 + hash01(1, seed) * 0.16);
  const ridgeX = x + w * (0.4 + hash01(2, seed) * 0.12);
  const lx = x + w * 0.3;
  const rx = x + w * 0.74;
  const ly = topY + h * 0.2;
  const ry = topY + h * 0.3;
  const nx = peakX + w * 0.16;
  const ny = topY + h * 0.14;
  g.fillStyle(ch(STONE, 0.95), 1).fillPoints(toPts([x, bot, lx, ly, peakX, topY, ridgeX, bot]), true);
  g.fillStyle(ch(STONE, 0.5), 1).fillPoints(toPts([ridgeX, bot, peakX, topY, nx, ny, rx, ry, x + w, bot]), true);
  g.fillStyle(ch(STONE, 1.3), 0.7).fillPoints(toPts([lx, ly, peakX, topY, peakX - w * 0.04, topY + h * 0.2, lx + w * 0.04, ly + h * 0.22]), true);
  // Strata: slanted bands across both planes.
  for (let yy = topY + h * 0.22; yy < bot - 10; yy += 16 + hash01(yy | 0, seed) * 12) {
    const t = (yy - topY) / (bot - topY);
    const xl = peakX - (peakX - x) * t + 3;
    const xr = peakX + (x + w - peakX) * t - 3;
    g.lineStyle(1.5, 0x4a3c2c, 0.28).lineBetween(xl, yy + 6, ridgeX, yy - 3).lineBetween(ridgeX, yy - 3, xr, yy + 5);
    g.lineStyle(1, ch(STONE, 1.5), 0.25).lineBetween(xl, yy + 8, ridgeX, yy - 1);
  }
  g.lineStyle(2, ch(STONE, 0.45), 0.3).strokePoints(toPts([x, bot, lx, ly, peakX, topY, nx, ny, rx, ry, x + w, bot]), false);
  g.lineStyle(2, ch(STONE, 0.4), 0.3).lineBetween(peakX, topY, ridgeX, bot);
  g.lineStyle(1.5, ch(STONE, 1.8), 0.4).lineBetween(peakX - 1, topY + 2, lx + 1, ly + 1);
  crack(g, ridgeX + w * 0.12, topY + h * 0.3, ridgeX + w * 0.05, bot - 12, seed + 5);
  // A vein of cold crystal shards growing from the lower flank (the same teal as the crystal clusters).
  for (let k = 0; k < 4; k++) {
    const bx = x + w * (0.14 + 0.22 * k) + hash01(k, seed + 20) * 4;
    const by = bot - h * (0.06 + 0.07 * (k % 2) + 0.03 * k);
    const sh = h * (0.24 + 0.1 * hash01(k, seed + 21));
    g.fillStyle(0x6fb5a2, 1).fillTriangle(bx - 5, by, bx, by - sh, bx + 1, by);
    g.fillStyle(0x3a7a6c, 1).fillTriangle(bx + 1, by, bx, by - sh, bx + 6, by);
    g.lineStyle(1, 0xd8fff0, 0.6).lineBetween(bx - 3, by - sh * 0.3, bx - 0.5, by - sh + 2);
  }
  moss(g, x + w * 0.5, bot - 3, w * 0.4, seed + 6);
  // Rubble at the foot.
  for (let k = 0; k < 4; k++) g.fillStyle(ch(STONE, 0.7 + hash01(k, seed + 8) * 0.4), 1).fillEllipse(x + w * (0.05 + 0.9 * hash01(k, seed + 12)), y + h - 3, 7 + hash01(k, seed + 13) * 7, 4);
}

/** Teal crystal ramp, dark to light: deep shade, shadow face, body, lit face, highlight (painterly: faces are banded, not one flat fill). */
const CRYS = [0x1f4d48, 0x2f6e62, 0x4e9a89, 0x7fd0b8, 0xcffff0] as const;

function crystals(g: Gfx, x: number, y: number, w: number, h: number, seed: number): void {
  const cx = x + w / 2;
  const base = y + h * 0.9;
  // A cold luminous bloom around and under the cluster (the only light on the arena floor besides the stage's own).
  for (const [k, a] of [[0.9, 0.05], [0.7, 0.07], [0.5, 0.09], [0.32, 0.12]] as const) g.fillStyle(0x8fe8cc, a).fillEllipse(cx, base - h * 0.35, w * (1 + k), h * k * 1.4);
  g.fillStyle(0xbffff0, 0.16).fillEllipse(cx, base - 1, w * 0.8, h * 0.14);
  // A rocky bed with a few cracked chips.
  g.fillStyle(ch(STONE, 0.6), 1).fillEllipse(cx, base - 2, w * 0.95, h * 0.24);
  g.fillStyle(ch(STONE, 0.85), 0.8).fillEllipse(cx - w * 0.1, base - 4, w * 0.6, h * 0.12);
  g.lineStyle(2, ch(STONE, 0.4), 0.3).strokeEllipse(cx, base - 2, w * 0.95, h * 0.24);
  const count = 5;
  const order = [0, 4, 1, 3, 2]; // back to front: the tall middle crystal is drawn last
  for (const k of order) {
    const t = k / (count - 1);
    const bx = x + w * (0.14 + 0.72 * t) + (hash01(k, seed) - 0.5) * 8;
    const mid = 1 - Math.abs(t - 0.5) * 1.3;
    const sh = h * (0.4 + 0.5 * mid * (0.7 + 0.3 * hash01(k, seed + 1)));
    const sw = w * (0.13 + 0.05 * hash01(k, seed + 2));
    const lean = (t - 0.5) * w * 0.16 + (hash01(k, seed + 3) - 0.5) * 8;
    const by = base - hash01(k, seed + 4) * 8;
    const tip = by - sh;
    const sx = bx + lean * 0.3; // shoulder x
    const sy = tip + sh * 0.28; // shoulder y: where the point begins
    const ridge = bx + lean * 0.35 + sw * 0.1; // the centre edge, slightly right of the axis so the lit face is wider
    // Body: left lit face, right shadow face.
    g.fillStyle(CRYS[2], 1).fillPoints(toPts([bx - sw, by, sx - sw * 0.9, sy, bx + lean, tip, ridge, by]), true);
    g.fillStyle(CRYS[1], 1).fillPoints(toPts([ridge, by, bx + lean, tip, sx + sw * 0.9, sy, bx + sw, by]), true);
    // Facet bands: a lighter upper strip on the lit face, a darker lower strip near the base, a thin mid facet beside the ridge.
    g.fillStyle(CRYS[3], 0.9).fillPoints(toPts([sx - sw * 0.9, sy, bx + lean, tip, ridge - sw * 0.25, tip + sh * 0.45, sx - sw * 0.45, sy + sh * 0.3]), true);
    g.fillStyle(CRYS[0], 0.45).fillPoints(toPts([bx - sw, by, bx - sw * 0.95, by - sh * 0.22, ridge, by - sh * 0.3, ridge, by]), true);
    g.fillStyle(CRYS[3], 0.55).fillPoints(toPts([ridge - sw * 0.25, tip + sh * 0.45, bx + lean, tip, ridge + sw * 0.18, tip + sh * 0.5]), true);
    g.fillStyle(CRYS[4], 0.5).fillPoints(toPts([bx + lean, tip, bx + lean - sw * 0.28, tip + sh * 0.2, bx + lean + sw * 0.2, tip + sh * 0.22]), true); // the polished tip cap
    // Inner glow: a soft core of light inside the crystal, strongest low where the stone feeds it, with a bright seam up the ridge.
    for (const [r, a] of [[1, 0.1], [0.7, 0.14], [0.45, 0.2]] as const) g.fillStyle(0xc8fff0, a).fillEllipse(bx + lean * 0.35, by - sh * 0.38, sw * 1.5 * r, sh * 0.5 * r);
    g.lineStyle(1.5, CRYS[4], 0.55).lineBetween(ridge, by - 2, bx + lean, tip + 2);
    // Painterly texture: short dabs of light and shade along the faces, so the planes are not flat fills.
    for (let d = 0; d < 7; d++) {
      const f = 0.12 + 0.76 * hash01(d, seed + 60 + k);
      const side = hash01(d, seed + 70 + k) < 0.55 ? -1 : 1;
      const px = bx + lean * (1 - f) * 0.7 + side * sw * (0.15 + 0.5 * hash01(d, seed + 80 + k)) * (0.4 + 0.6 * f);
      const py = by - sh * f;
      g.lineStyle(1.2, side < 0 ? CRYS[4] : CRYS[0], side < 0 ? 0.28 : 0.3).lineBetween(px, py, px + side * 1.5, py - 4 - 4 * hash01(d, seed + 90 + k));
    }
    // Soft tonal edges (no black outline) and a glint on the lit edge.
    g.lineStyle(1.5, CRYS[0], 0.45).strokePoints(toPts([bx - sw, by, sx - sw * 0.9, sy, bx + lean, tip, sx + sw * 0.9, sy, bx + sw, by]), false);
    g.lineStyle(1.5, CRYS[4], 0.7).lineBetween(sx - sw * 0.85, sy + 2, bx + lean - 1, tip + 3);
    g.fillStyle(0xffffff, 0.8).fillCircle(bx + lean - sw * 0.1, tip + sh * 0.22, 1.4);
  }
  // Chips of broken crystal on the bed.
  for (let k = 0; k < 4; k++) {
    const px = x + w * (0.06 + 0.88 * hash01(k, seed + 100));
    const py = base - 1 + hash01(k, seed + 101) * 3;
    g.fillStyle(CRYS[k % 2 === 0 ? 3 : 1], 1).fillTriangle(px - 3, py, px, py - 5 - 3 * hash01(k, seed + 102), px + 3, py);
  }
}

/** Draws the prop of patch `i` in its footprint (x, y, w, h). */
export function drawRock(g: Gfx, x: number, y: number, w: number, h: number, i: number, highContrast: boolean): void {
  const seed = i * 29 + 7;
  shadow(g, x, y, w, h);
  const kind = propKind(w, h, i);
  if (kind === 'pillar') pillar(g, x, y, w, h, seed);
  else if (kind === 'crystal') crystals(g, x, y, w, h, seed);
  else boulder(g, x, y, w, h, seed);
  if (highContrast) g.lineStyle(3, 0xffffff, 1).strokeRect(x - 1, y - 1, w + 2, h + 2);
}
