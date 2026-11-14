import type Phaser from 'phaser';
import { TRAP_BOX_PX, TrapKind } from '@core/index';
import { hash01, mute } from './grim-fx';
import type { TrapPhase } from './trap-fx';

/**
 * Per-kind trap painters (view only). Each trap kind has its own silhouette and motion, drawn runtime with two Graphics: `under`
 * (normal blend, dark stained ground) and `glow` (additive light). Grim and desaturated: every colour goes through `mute`, no
 * white, no bold outline. Arming shows the thing assembling (`phase.arm`); the last ticks of life quicken it (`phase.urgency`).
 * Reduced motion arrives as a frozen `phase.t`, so a still frame equals the animated one at one instant.
 */
type Gfx = Phaser.GameObjects.Graphics;

const HALF = TRAP_BOX_PX / 2;
const TAU = Math.PI * 2;
/** Mute levels: the tones stay close to the element but ashy. */
const tone = (c: number, keep: number, dark: number): number => mute(c, keep, dark);

/** An irregular closed blob, as a flat point list around (cx, cy). */
function blob(cx: number, cy: number, rx: number, ry: number, salt: number, wobble: number, t: number): number[] {
  const pts: number[] = [];
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * TAU;
    const r = 1 + (hash01(i, salt) - 0.5) * 0.34 + Math.sin(t * 1.4 + i * 1.7) * wobble;
    pts.push(cx + Math.cos(a) * rx * r, cy + Math.sin(a) * ry * r);
  }
  return pts;
}

function poly(g: Gfx, pts: readonly number[], fill: number, alpha: number): void {
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i + 1 < pts.length; i += 2) out.push({ x: pts[i] ?? 0, y: pts[i + 1] ?? 0 });
  g.fillStyle(fill, alpha).fillPoints(out as Phaser.Math.Vector2[], true);
}

/** Fire Bomb: a charred pod, its cracks glowing and pulsing faster as the fuse runs down; cinders drift up. */
function paintFireBomb(under: Gfx, glow: Gfx, cx: number, cy: number, p: TrapPhase, a: number, base: number): void {
  const pulse = 0.5 + 0.5 * Math.sin(p.t * (4 + p.urgency * 14));
  const heat = (0.25 + 0.6 * p.arm) * (0.55 + 0.45 * pulse) * a;
  under.fillStyle(0x000000, 0.28 * a).fillEllipse(cx, cy + 4, 50, 32);
  poly(under, blob(cx, cy, 20 * (0.6 + 0.4 * p.arm), 15 * (0.6 + 0.4 * p.arm), 3, 0.015, p.t), tone(0x2a1a12, 0.5, 0.8), 0.9 * a);
  poly(under, blob(cx - 2, cy - 2, 12 * (0.6 + 0.4 * p.arm), 9, 5, 0.02, p.t), tone(0x4a3020, 0.4, 0.8), 0.6 * a);
  const seam = tone(base, 0.55, 1.05);
  for (let i = 0; i < 6; i++) {
    const ang = hash01(i, 71) * TAU;
    const r0 = 3 + hash01(i, 72) * 4;
    const r1 = (11 + hash01(i, 73) * 9) * p.arm;
    const bend = (hash01(i, 74) - 0.5) * 0.7;
    const x0 = cx + Math.cos(ang) * r0;
    const y0 = cy + Math.sin(ang) * r0 * 0.7;
    const xm = cx + Math.cos(ang + bend) * (r0 + r1) * 0.6;
    const ym = cy + Math.sin(ang + bend) * (r0 + r1) * 0.6 * 0.7;
    const x1 = cx + Math.cos(ang + bend * 1.6) * (r0 + r1);
    const y1 = cy + Math.sin(ang + bend * 1.6) * (r0 + r1) * 0.7;
    glow.lineStyle(5, seam, 0.07 * heat).lineBetween(x0, y0, xm, ym).lineBetween(xm, ym, x1, y1);
    glow.lineStyle(1.5, seam, 0.55 * heat).lineBetween(x0, y0, xm, ym).lineBetween(xm, ym, x1, y1);
  }
  glow.fillStyle(seam, 0.1 * heat).fillCircle(cx, cy, 24);
  glow.fillStyle(seam, 0.16 * heat).fillCircle(cx, cy, 11);
  // Cinders rising off the pod.
  for (let i = 0; i < 6; i++) {
    const life = (p.t * (0.5 + hash01(i, 80) * 0.5) + hash01(i, 81)) % 1;
    const x = cx + (hash01(i, 82) - 0.5) * 26 + Math.sin(p.t * 2 + i) * 2;
    const y = cy - 6 - life * 28;
    glow.fillStyle(seam, Math.sin(life * Math.PI) * 0.55 * a * p.arm).fillCircle(x, y, 1.1);
  }
}

/** Puddle: a murky pool with a wet rim, slow ripples spreading and the odd bubble. */
function paintPuddle(under: Gfx, glow: Gfx, cx: number, cy: number, p: TrapPhase, a: number, base: number): void {
  const k = 0.55 + 0.45 * p.arm;
  const water = tone(base, 0.4, 0.5);
  poly(under, blob(cx, cy, 27 * k, 22 * k, 11, 0.02, p.t), 0x07090a, 0.3 * a);
  poly(under, blob(cx, cy, 25 * k, 20 * k, 12, 0.03, p.t * 0.8), water, 0.5 * a);
  poly(under, blob(cx + 2, cy + 2, 16 * k, 12 * k, 13, 0.04, p.t * 0.6), tone(base, 0.3, 0.32), 0.5 * a);
  for (let i = 0; i < 3; i++) {
    const ph = (p.t * 0.35 * (1 + p.urgency) + i / 3) % 1;
    glow.lineStyle(1.2, tone(base, 0.45, 1), (1 - ph) * 0.42 * a * p.arm).strokeEllipse(cx, cy, 40 * ph * k + 4, 30 * ph * k + 3);
  }
  for (let i = 0; i < 4; i++) {
    const life = (p.t * 0.4 + hash01(i, 90)) % 1;
    const bx = cx + (hash01(i, 91) - 0.5) * 30;
    const by = cy + (hash01(i, 92) - 0.5) * 18 - life * 4;
    glow.lineStyle(1, tone(base, 0.4, 1.1), Math.sin(life * Math.PI) * 0.5 * a * p.arm).strokeCircle(bx, by, 1.5 + hash01(i, 93) * 1.5);
  }
}

/** Spike: a cracked mound with bone-grey tusks that heave up during arming and stand, jittering, as the end nears. */
function paintSpike(under: Gfx, glow: Gfx, cx: number, cy: number, p: TrapPhase, a: number, base: number): void {
  const soil = tone(base, 0.35, 0.4);
  under.fillStyle(0x000000, 0.25 * a).fillEllipse(cx, cy + 4, 50, 30);
  poly(under, blob(cx, cy + 2, 25, 17, 21, 0, 0), soil, 0.6 * a);
  for (let i = 0; i < 7; i++) {
    const ang = hash01(i, 22) * TAU;
    const r = 6 + hash01(i, 23) * 14;
    const x = cx + Math.cos(ang) * r;
    const y = cy + Math.sin(ang) * r * 0.6;
    under.lineStyle(1, 0x0a0806, 0.5 * a).lineBetween(x, y, x + (hash01(i, 24) - 0.5) * 14, y + (hash01(i, 25) - 0.5) * 8);
  }
  const bone = tone(0xd8d0b8, 0.35, 0.78);
  const dark = tone(0xd8d0b8, 0.3, 0.42);
  const spikes = 5;
  for (let i = 0; i < spikes; i++) {
    const bx = cx + (i - (spikes - 1) / 2) * 8.5 + (hash01(i, 30) - 0.5) * 4;
    const by = cy + 4 + (i % 2) * 5 - (hash01(i, 31)) * 4;
    const h = (10 + hash01(i, 32) * 10) * (0.12 + 0.88 * p.arm);
    const w = 3.2 + hash01(i, 33) * 1.6;
    const shake = p.urgency * Math.sin(p.t * 40 + i * 2) * 0.9;
    const tip = [bx - w + shake, by, bx + w + shake, by, bx + shake * 1.6, by - h];
    poly(under, tip, dark, 0.95 * a);
    poly(under, [bx - w * 0.2 + shake, by, bx + w + shake, by, bx + shake * 1.6, by - h], bone, 0.85 * a);
  }
  // A cold dust shimmer while it heaves.
  if (p.arm < 1) glow.fillStyle(bone, 0.08 * a).fillEllipse(cx, cy, 44 * (1.1 - p.arm * 0.2), 24);
}

/** Gust: a ring of grit spiralling round a hollow eye, two counter-turning arcs, flecks on the wind. */
function paintGust(under: Gfx, glow: Gfx, cx: number, cy: number, p: TrapPhase, a: number, base: number): void {
  const k = 0.5 + 0.5 * p.arm;
  const air = tone(base, 0.35, 0.75);
  under.fillStyle(0x000000, 0.12 * a).fillEllipse(cx, cy + 3, 46 * k, 24 * k);
  poly(under, blob(cx, cy, 20 * k, 13 * k, 41, 0.03, p.t), tone(base, 0.2, 0.42), 0.3 * a);
  const spin = p.t * (1.6 + p.urgency * 3);
  for (let arm = 0; arm < 3; arm++) {
    const pts: { x: number; y: number }[] = [];
    for (let s = 0; s <= 16; s++) {
      const f = s / 16;
      const ang = spin + arm * (TAU / 3) + f * 3.4;
      const r = (3 + f * 21) * k;
      pts.push({ x: cx + Math.cos(ang) * r, y: cy + Math.sin(ang) * r * 0.62 });
    }
    glow.lineStyle(4, air, 0.05 * a).strokePoints(pts as Phaser.Math.Vector2[], false);
    glow.lineStyle(1.2, tone(base, 0.4, 1.05), 0.4 * a * p.arm).strokePoints(pts as Phaser.Math.Vector2[], false);
  }
  for (let i = 0; i < 9; i++) {
    const ang = -spin * 0.7 + hash01(i, 50) * TAU;
    const r = (8 + hash01(i, 51) * 17) * k;
    const x = cx + Math.cos(ang) * r;
    const y = cy + Math.sin(ang) * r * 0.62;
    under.fillStyle(tone(0xb8a890, 0.3, 0.7), 0.5 * a * p.arm).fillRect(x, y, 2, 1.5);
  }
}

export type TrapPainter = (under: Gfx, glow: Gfx, cx: number, cy: number, phase: TrapPhase, alpha: number, base: number) => void;

/** Painter per `TrapKind` (index 0 unused). */
export const TRAP_PAINTERS: readonly (TrapPainter | undefined)[] = [undefined, paintFireBomb, paintPuddle, paintSpike, paintGust];

/** Draws one trap of `kind` with its top-left at (x, y); false when the kind has no painter. */
export function paintTrap(under: Gfx, glow: Gfx, kind: number, x: number, y: number, phase: TrapPhase, alpha: number, base: number): boolean {
  const fn = TRAP_PAINTERS[kind];
  if (!fn || kind === TrapKind.none) return false;
  fn(under, glow, x + HALF, y + HALF, phase, alpha, base);
  return true;
}
