import type Phaser from 'phaser';
import { TRAP_BOX_PX, TrapKind } from '@core/index';
import { hash01, mute } from './grim-fx';
import type { TrapPhase } from './trap-fx';

/**
 * Per-kind trap painters (view only). Every trap is a flat ground decal in the floor's perspective (an ellipse, 0.6 tall): a dark
 * scorch/stain, a rune ring of 12 segments and a kind glyph, plus a few small animated accents (flame tongues, ripples, tusks,
 * grit). Two Graphics: `under` (normal blend) and `glow` (additive, element-coloured). Grim and desaturated through `mute`, no
 * white, no bold outline. Phases: arming lights the ring segment by segment and grows the glyph (`phase.arm`); armed is a full
 * pulsing ring; the last ticks of life quicken everything (`phase.urgency`). Reduced motion arrives as a frozen `phase.t`.
 */
type Gfx = Phaser.GameObjects.Graphics;

const HALF = TRAP_BOX_PX / 2;
const TAU = Math.PI * 2;
/** Ground perspective: decals are ellipses this much flatter than they are wide. */
const FLAT = 0.6;
const SEGMENTS = 12;
/** Decal radius (px, horizontal). */
const R = 31;
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

/** Points along an ellipse arc. */
function arcPts(cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, n: number): Phaser.Math.Vector2[] {
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    pts.push({ x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry });
  }
  return pts as Phaser.Math.Vector2[];
}

/**
 * The shared ground decal: soft shadow, dark stain, a dim inlay ring (always there, so the spot reads before it works) and the
 * 12 rune segments that light one by one while arming, then pulse together once armed. `spin` turns the segments slowly.
 */
function runeRing(under: Gfx, glow: Gfx, cx: number, cy: number, p: TrapPhase, a: number, col: number, spin: number): void {
  const ry = R * FLAT;
  const lit = p.arm >= 1 ? SEGMENTS : Math.floor(p.arm * SEGMENTS);
  const pulse = 0.65 + 0.35 * Math.sin(p.t * (3 + p.urgency * 12));
  under.fillStyle(0x000000, 0.34 * a).fillEllipse(cx, cy + 2, R * 2.2, ry * 2.3);
  under.fillStyle(0x0c0907, 0.55 * a).fillEllipse(cx, cy, R * 2, ry * 2);
  under.lineStyle(2, tone(col, 0.35, 0.3), 0.7 * a).strokePoints(arcPts(cx, cy, R, ry, 0, TAU, 28), true);
  under.lineStyle(1, tone(col, 0.3, 0.22), 0.6 * a).strokePoints(arcPts(cx, cy, R * 0.62, ry * 0.62, 0, TAU, 20), true);
  const seg = TAU / SEGMENTS;
  for (let i = 0; i < SEGMENTS; i++) {
    const a0 = spin + i * seg + seg * 0.12;
    const pts = arcPts(cx, cy, R, ry, a0, a0 + seg * 0.62, 4);
    if (i >= lit) {
      under.lineStyle(2, tone(col, 0.3, 0.4), 0.55 * a).strokePoints(pts, false);
      continue;
    }
    const k = (p.arm >= 1 ? pulse : 1) * a;
    glow.lineStyle(7, tone(col, 0.8, 1), 0.08 * k).strokePoints(pts, false);
    glow.lineStyle(2.2, tone(col, 0.7, 1.1), 0.7 * k).strokePoints(pts, false);
  }
  if (p.arm >= 1) glow.fillStyle(tone(col, 0.7, 1), 0.07 * pulse * a).fillEllipse(cx, cy, R * 1.9, ry * 1.9);
}

/** A flame tongue (additive triangle pair) rising from (x, y). */
function tongue(glow: Gfx, x: number, y: number, h: number, w: number, col: number, alpha: number): void {
  glow.fillStyle(col, alpha * 0.45).fillTriangle(x - w, y, x + w, y, x, y - h);
  glow.fillStyle(tone(0xffc060, 0.6, 1.1), alpha * 0.55).fillTriangle(x - w * 0.45, y, x + w * 0.45, y, x, y - h * 0.6);
}

/** Fire Bomb (flame vent): a scorched ring, glowing cracks and tongues that grow while arming and lick when armed. */
function paintFireBomb(under: Gfx, glow: Gfx, cx: number, cy: number, p: TrapPhase, a: number, base: number): void {
  const hot = tone(base, 0.85, 1.05);
  runeRing(under, glow, cx, cy, p, a, base, p.t * 0.25);
  poly(under, blob(cx, cy, 14, 9, 3, 0.015, p.t), tone(0x1c100b, 0.5, 0.8), 0.85 * a);
  const heat = (0.2 + 0.8 * p.arm) * (0.6 + 0.4 * Math.sin(p.t * (4 + p.urgency * 14))) * a;
  for (let i = 0; i < 7; i++) {
    const ang = (i / 7) * TAU + hash01(i, 71) * 0.5;
    const r0 = 4 + hash01(i, 72) * 3;
    const r1 = (10 + hash01(i, 73) * 11) * (0.3 + 0.7 * p.arm);
    const mid = ang + (hash01(i, 74) - 0.5) * 0.6;
    glow
      .lineStyle(1.6, hot, 0.65 * heat)
      .lineBetween(cx + Math.cos(ang) * r0, cy + Math.sin(ang) * r0 * FLAT, cx + Math.cos(mid) * (r0 + r1), cy + Math.sin(mid) * (r0 + r1) * FLAT);
  }
  glow.fillStyle(hot, 0.16 * heat).fillEllipse(cx, cy, 24, 14);
  for (let i = 0; i < 3; i++) {
    const flick = 0.7 + 0.3 * Math.sin(p.t * (7 + i * 2 + p.urgency * 10) + i * 2);
    const h = (6 + (i === 1 ? 9 : 5)) * (0.25 + 0.75 * p.arm) * flick;
    tongue(glow, cx + (i - 1) * 6, cy + 1, h, i === 1 ? 3.4 : 2.6, hot, a);
  }
  for (let i = 0; i < 6; i++) {
    const life = (p.t * (0.5 + hash01(i, 80) * 0.5) + hash01(i, 81)) % 1;
    glow.fillStyle(hot, Math.sin(life * Math.PI) * 0.6 * a * p.arm).fillCircle(cx + (hash01(i, 82) - 0.5) * 22 + Math.sin(p.t * 2 + i) * 2, cy - 6 - life * 26, 1.1);
  }
}

/** Puddle (ice and water patch): a dark mere with a frosted rim, ripples spreading and the odd bubble. */
function paintPuddle(under: Gfx, glow: Gfx, cx: number, cy: number, p: TrapPhase, a: number, base: number): void {
  const k = 0.5 + 0.5 * p.arm;
  runeRing(under, glow, cx, cy, p, a, base, -p.t * 0.2);
  poly(under, blob(cx, cy, 21 * k, 12.5 * k, 12, 0.03, p.t * 0.8), tone(base, 0.5, 0.42), 0.85 * a);
  poly(under, blob(cx + 2, cy + 1, 13 * k, 7.5 * k, 13, 0.04, p.t * 0.6), tone(base, 0.4, 0.26), 0.85 * a);
  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * TAU + hash01(i, 14) * 0.4;
    const x = cx + Math.cos(ang) * 22 * k;
    const y = cy + Math.sin(ang) * 13 * k;
    const h = (3 + hash01(i, 15) * 4) * p.arm;
    under.fillStyle(tone(0xcfe8f2, 0.4, 0.8), 0.8 * a).fillTriangle(x - 1.4, y, x + 1.4, y, x + (hash01(i, 16) - 0.5) * 2, y - h);
  }
  for (let i = 0; i < 3; i++) {
    const ph = (p.t * 0.4 * (1 + p.urgency) + i / 3) % 1;
    glow.lineStyle(1.3, tone(base, 0.7, 1.1), (1 - ph) * 0.6 * a * p.arm).strokeEllipse(cx, cy, 36 * ph * k + 4, 22 * ph * k + 3);
  }
  for (let i = 0; i < 3; i++) {
    const life = (p.t * 0.4 + hash01(i, 90)) % 1;
    glow
      .lineStyle(1, tone(base, 0.6, 1.2), Math.sin(life * Math.PI) * 0.6 * a * p.arm)
      .strokeCircle(cx + (hash01(i, 91) - 0.5) * 24, cy + (hash01(i, 92) - 0.5) * 10 - life * 4, 1.5 + hash01(i, 93) * 1.5);
  }
}

/** Spike (thorn burst): a cracked ring of earth with bone tusks heaving up round it; they stand and jitter as the end nears. */
function paintSpike(under: Gfx, glow: Gfx, cx: number, cy: number, p: TrapPhase, a: number, base: number): void {
  runeRing(under, glow, cx, cy, p, a, base, p.t * 0.15);
  for (let i = 0; i < 8; i++) {
    const ang = hash01(i, 22) * TAU;
    const rr = 5 + hash01(i, 23) * 18;
    const x = cx + Math.cos(ang) * rr;
    const y = cy + Math.sin(ang) * rr * FLAT;
    under.lineStyle(1, 0x080604, 0.7 * a).lineBetween(x, y, x + (hash01(i, 24) - 0.5) * 12, y + (hash01(i, 25) - 0.5) * 6);
  }
  const bone = tone(0xd8d0b8, 0.35, 0.8);
  const dark = tone(0xd8d0b8, 0.3, 0.4);
  const count = 9;
  // Back to front so the near tusks overlap the far ones.
  const order = Array.from({ length: count }, (_, i) => i).sort((m, n) => Math.sin((m / count) * TAU + 0.3) - Math.sin((n / count) * TAU + 0.3));
  for (const i of order) {
    const ang = (i / count) * TAU + 0.3;
    const ring = i % 3 === 2 ? 0.3 : 0.72;
    const bx = cx + Math.cos(ang) * R * ring;
    const by = cy + Math.sin(ang) * R * ring * FLAT + 2;
    const h = (9 + hash01(i, 32) * 8) * (0.1 + 0.9 * p.arm);
    const w = 2.6 + hash01(i, 33) * 1.2;
    const shake = p.urgency * Math.sin(p.t * 40 + i * 2) * 0.9;
    under.fillStyle(0x000000, 0.35 * a).fillEllipse(bx + 1, by + 1, w * 2.4, w);
    poly(under, [bx - w + shake, by, bx + w + shake, by, bx + shake * 1.6, by - h], dark, 0.95 * a);
    poly(under, [bx - w * 0.2 + shake, by, bx + w + shake, by, bx + shake * 1.6, by - h], bone, 0.9 * a);
  }
  if (p.arm < 1) glow.fillStyle(tone(base, 0.6, 1), 0.1 * a).fillEllipse(cx, cy, 44, 26);
}

/** Gust (air glyph): a pale ring whose three arms spiral round a hollow eye, grit flecks on the wind. */
function paintGust(under: Gfx, glow: Gfx, cx: number, cy: number, p: TrapPhase, a: number, base: number): void {
  runeRing(under, glow, cx, cy, p, a, base, p.t * (0.4 + p.urgency));
  const k = 0.45 + 0.55 * p.arm;
  const spin = p.t * (1.6 + p.urgency * 3);
  for (let arm = 0; arm < 3; arm++) {
    const pts: { x: number; y: number }[] = [];
    for (let s = 0; s <= 16; s++) {
      const f = s / 16;
      const ang = spin + arm * (TAU / 3) + f * 3.4;
      pts.push({ x: cx + Math.cos(ang) * (3 + f * 19) * k, y: cy + Math.sin(ang) * (3 + f * 19) * k * FLAT });
    }
    glow.lineStyle(4.5, tone(base, 0.6, 1), 0.08 * a).strokePoints(pts as Phaser.Math.Vector2[], false);
    glow.lineStyle(1.4, tone(base, 0.55, 1.1), 0.65 * a * (0.4 + 0.6 * p.arm)).strokePoints(pts as Phaser.Math.Vector2[], false);
  }
  for (let i = 0; i < 10; i++) {
    const ang = -spin * 0.7 + hash01(i, 50) * TAU;
    const rr = (7 + hash01(i, 51) * 17) * k;
    under.fillStyle(tone(0xb8a890, 0.3, 0.8), 0.7 * a * p.arm).fillRect(cx + Math.cos(ang) * rr, cy + Math.sin(ang) * rr * FLAT - 3 * hash01(i, 52), 2, 1.5);
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
