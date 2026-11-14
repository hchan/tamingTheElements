import type Phaser from 'phaser';
import { hash01, mute, toPts } from './grim-fx';

/**
 * Grim ground marks for the Arcade terrain patches (owner: the pads read as flat UI boxes). Each fire, water or air patch is a
 * worn decal on the floor: an irregular, feathered stain (scorched, damp or frosted) with grain, a few element-muted marks and one
 * small rune. It fills the sim's patch rectangle (the footprint is unchanged) but never as a crisp box. Static: drawn once per
 * layout, no per-frame work. Pure drawing helpers, `stage` 1 fire, 2 water, 4 air.
 */
type Gfx = Phaser.GameObjects.Graphics;

/** Per-stage palette: the stain, a lighter wear colour, the mark colour (cracks, ripples, scratches) and the rune colour. */
const LOOK: Record<number, { stain: number; wear: number; mark: number; rune: number }> = {
  1: { stain: 0x1a0c08, wear: 0x5a2410, mark: mute(0xff8a2a, 0.85, 0.98), rune: 0xd0b48a },
  2: { stain: 0x0c1418, wear: 0x24363f, mark: mute(0x3aa0ff, 0.4, 0.6), rune: 0x8296a0 },
  4: { stain: 0x2c3252, wear: 0x8a9ad0, mark: mute(0xc8f0ff, 0.35, 0.62), rune: 0xa8b4b8 },
};

/** The ragged outline: a squircle through the rect, each point pushed in by a seeded amount (never beyond the rect). */
function outline(x: number, y: number, w: number, h: number, seed: number, scale: number): number[] {
  const pts: number[] = [];
  const n = 28;
  const cx = x + w / 2;
  const cy = y + h / 2;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const k = (0.84 + hash01(i, seed) * 0.16) * scale;
    pts.push(cx + (w / 2) * Math.sign(c) * Math.abs(c) ** 0.45 * k, cy + (h / 2) * Math.sign(s) * Math.abs(s) ** 0.45 * k);
  }
  return pts;
}

/** A jagged line from (x0, y0) toward (x1, y1) with seeded sideways kinks. */
function crack(g: Gfx, x0: number, y0: number, x1: number, y1: number, seed: number, color: number, alpha: number): void {
  const steps = 5;
  const pts: number[] = [x0, y0];
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    pts.push(x0 + (x1 - x0) * t + (hash01(i, seed) - 0.5) * 12, y0 + (y1 - y0) * t + (hash01(i, seed + 1) - 0.5) * 12);
  }
  const p = toPts(pts);
  g.lineStyle(4, color, alpha * 0.18).strokePoints(p, false);
  g.lineStyle(1, color, alpha).strokePoints(p, false);
}

/** The small rune at the centre: a thin outline, bone-muted, never filled. */
function rune(g: Gfx, stage: number, x: number, y: number, color: number): void {
  g.lineStyle(1.5, color, 0.5);
  if (stage === 1) g.strokeTriangle(x - 9, y + 10, x + 9, y + 10, x, y - 12).lineBetween(x, y - 2, x, y + 10);
  else if (stage === 2) g.strokeTriangle(x, y - 12, x - 7, y + 1, x + 7, y + 1).strokeCircle(x, y + 3, 7);
  else {
    g.beginPath().moveTo(x, y);
    for (let a = 0; a <= 11; a += 0.5) g.lineTo(x + Math.cos(a) * (1 + a), y + Math.sin(a) * (1 + a));
    g.strokePath();
  }
}

export function drawPad(g: Gfx, stage: number, x: number, y: number, w: number, h: number, i: number, highContrast: boolean): void {
  const look = LOOK[stage] ?? LOOK[1];
  if (!look) return;
  const seed = i * 17 + stage * 101;
  const cx = x + w / 2;
  const cy = y + h / 2;
  // Feathered stain: stacked layers, wide and faint to small and dense, with a lighter worn middle.
  for (const [s, a] of [[1, 0.1], [0.94, 0.12], [0.84, 0.13], [0.7, 0.1]] as const) g.fillStyle(look.stain, a).fillPoints(toPts(outline(x, y, w, h, seed, s)), true);
  // Fire: a banked-coal glow under the cracks, so the pad is a lit hot spot, not a dark hole in the floor.
  if (stage === 1) for (const [s, a] of [[0.7, 0.1], [0.5, 0.12], [0.3, 0.14]] as const) g.fillStyle(0xff7a1a, a).fillEllipse(cx, cy, w * s, h * s);
  g.fillStyle(look.wear, stage === 4 ? 0.12 : 0.16).fillPoints(toPts(outline(x, y, w, h, seed + 5, 0.62)), true);
  // Grain: dark and pale flecks inside the stain.
  for (let n = 0; n < 30; n++) {
    const px = x + w * (0.1 + 0.8 * hash01(n, seed + 11));
    const py = y + h * (0.1 + 0.8 * hash01(n, seed + 12));
    const dark = n % 2 === 0;
    g.fillStyle(dark ? 0x050403 : look.wear, dark ? 0.16 : 0.3).fillRect(px, py, n % 5 === 0 ? 3 : 2, 2);
  }
  // Element marks.
  if (stage === 1) {
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + hash01(k, seed) * 0.8;
      crack(g, cx + Math.cos(a) * 14, cy + Math.sin(a) * 14, cx + Math.cos(a) * w * 0.38, cy + Math.sin(a) * h * 0.38, seed + k * 3, look.mark, 0.95);
    }
    for (let k = 0; k < 7; k++) g.fillStyle(0xffb347, 0.8).fillRect(x + w * (0.2 + 0.6 * hash01(k, seed + 21)), y + h * (0.2 + 0.6 * hash01(k, seed + 22)), 2, 2);
  } else if (stage === 2) {
    for (const [r, a] of [[0.18, 0.4], [0.3, 0.3], [0.42, 0.2]] as const) g.lineStyle(1, look.mark, a).strokeEllipse(cx + 4, cy + 6, w * r * 1.7, h * r * 1.5);
    g.fillStyle(look.rune, 0.07).fillEllipse(cx - w * 0.14, cy - h * 0.12, w * 0.3, h * 0.12);
  } else {
    for (let k = 0; k < 9; k++) {
      const a = hash01(k, seed) * Math.PI * 2;
      const r0 = 18 + hash01(k, seed + 1) * 24;
      g.lineStyle(1, look.mark, 0.35).lineBetween(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0 * 0.8, cx + Math.cos(a + 0.5) * (r0 + 30), cy + Math.sin(a + 0.5) * (r0 + 30) * 0.8);
    }
  }
  rune(g, stage, cx, cy, look.rune);
  // Footprint cue: dim corner ticks (the sim's box), so the patch's reach is still readable on any floor.
  g.lineStyle(1, look.rune, 0.25);
  for (const [px, py, dx, dy] of [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]] as const) {
    g.lineBetween(px, py, px + dx * 12, py).lineBetween(px, py, px, py + dy * 12);
  }
  if (highContrast) g.lineStyle(5, 0x000000, 1).strokeRect(x + 1, y + 1, w - 2, h - 2).lineStyle(2, 0xffffff, 1).strokeRect(x - 1, y - 1, w + 2, h + 2);
}
