import type Phaser from 'phaser';
import { PULL_TENDRIL_START_PX } from '../views/fx-draw-tweaks';
import { hash01, paintEmbers, toPts } from './grim-fx';

/**
 * Cast FX for three roster24 slots that drew almost nothing, view only (no sim event: the view reads a rise of the action-bar
 * slot's `readyTick`, as Kindrel and Glimmaw do). Hyalia's Bell Pulse (air, omni) rolls tarnished rings out from the caster;
 * Zephra's Static Mote (air, range, 10 px/tick) is a jagged spark riding the real projectile; Abyssor's Abyssal Pull (water,
 * range, 14 px/tick, stops at 280 px, drags 120 px) is a dark tendril that lashes out and hauls back. Pure geometry (no
 * Phaser objects, no Math.random): reduced motion draws the same shapes held at their mid-life pose. Muted, grim tones.
 */
export const BELL_SPRITE = 'bellPulse';
export const MOTE_SPRITE = 'staticMote';
export const PULL_SPRITE = 'abyssalPull';
export const BELL_TICKS = 32;
export const MOTE_TICKS = 30;
export const PULL_TICKS = 36;
/** Mote speed (px/tick) and tendril speed, reach and drag: abilities-c.ts (a test pins them). */
export const MOTE_SPEED = 10;
export const PULL_SPEED = 14;
export const PULL_REACH = 280;
export const PULL_DRAG = 120;
export const BELL_COLOR = 0xa9b4b8;
export const MOTE_COLOR = 0x9fc0d8;
export const MOTE_CORE = 0xe8f0f4;
export const PULL_COLOR = 0x24566a;
export const PULL_SUCKER = 0xb8a890;
export const BELL_POP = 'BELL';
export const PULL_POP = 'PULL';

export interface Mote { readonly x: number; readonly y: number; readonly r: number; readonly a: number }

const fade = (t: number, reduced: boolean): number => (reduced ? 0.85 : t < 0.12 ? t / 0.12 : 1 - ((t - 0.12) / 0.88) ** 2);
const side = (dir: number): number => (dir >= 3 && dir <= 5 ? -1 : 1);

export interface BellFx {
  /** Ring centre and the radii of the rolling rings with their own alpha (outer fades first). */
  readonly centre: { x: number; y: number };
  readonly rings: readonly { r: number; a: number }[];
  /** Small tarnished chips flung by the pulse. */
  readonly motes: readonly Mote[];
  readonly alpha: number;
}

/** Bell Pulse `age` view ticks after the cast, centred on (x, y); undefined once over. */
export function bellPulse(x: number, y: number, age: number, reduced: boolean): BellFx | undefined {
  if (age < 0 || age > BELL_TICKS) return undefined;
  const t = reduced ? 0.5 : age / BELL_TICKS;
  const rings: { r: number; a: number }[] = [];
  for (let k = 0; k < 3; k++) {
    const u = Math.min(1, Math.max(0, t * 1.5 - k * 0.22));
    if (u > 0) rings.push({ r: 14 + u * 96, a: (1 - u) * (1 - k * 0.2) });
  }
  const motes: Mote[] = [];
  for (let i = 0; i < 10; i++) {
    const ang = hash01(i, 81) * Math.PI * 2;
    const d = 18 + t * (50 + hash01(i, 82) * 50);
    motes.push({ x: x + Math.cos(ang) * d, y: y + Math.sin(ang) * d * 0.7, r: 1.4 + hash01(i, 83) * 1.6, a: 1 - t });
  }
  return { centre: { x, y }, rings, motes, alpha: fade(t, reduced) };
}

export interface MoteFx {
  /** The spark bolt: a short zig-zag polyline (x,y pairs) ending at the projectile. */
  readonly bolt: readonly number[];
  readonly head: { x: number; y: number; r: number };
  readonly sparks: readonly Mote[];
  readonly alpha: number;
}

/** Static Mote `age` view ticks after the cast, flying from (x, y) along dir8 `dir`; undefined once over. */
export function staticMote(x: number, y: number, dir: number, age: number, reduced: boolean): MoteFx | undefined {
  if (age < 0 || age > MOTE_TICKS) return undefined;
  const t = reduced ? 0.4 : age / MOTE_TICKS;
  const s = side(dir);
  const hx = x + s * (10 + MOTE_SPEED * (reduced ? 12 : age));
  const bolt: number[] = [];
  for (let i = 0; i <= 7; i++) {
    const back = i / 7;
    bolt.push(hx - s * back * 46, y + (i === 0 ? 0 : (hash01(i + (reduced ? 0 : age), 84) - 0.5) * 14 * back));
  }
  const sparks: Mote[] = [];
  for (let i = 0; i < 7; i++) {
    const back = hash01(i, 85) * 60;
    sparks.push({ x: hx - s * back, y: y + (hash01(i + (reduced ? 0 : age), 86) - 0.5) * 26, r: 1 + hash01(i, 87) * 1.3, a: 1 - back / 70 });
  }
  return { bolt, head: { x: hx, y, r: 4 + (reduced ? 0 : hash01(age, 88)) }, sparks, alpha: fade(t, reduced) };
}

export interface PullFx {
  /** Tendril polyline (x,y pairs), caster to tip. */
  readonly tendril: readonly number[];
  readonly tip: { x: number; y: number; r: number };
  /** Pale sucker dots along the underside. */
  readonly suckers: readonly Mote[];
  /** Rising murk bubbles. */
  readonly bubbles: readonly Mote[];
  readonly alpha: number;
}

/** Abyssal Pull `age` view ticks after the cast: lashes out to 280 px, then hauls back 120 px; undefined once over. */
export function abyssalPull(x: number, y: number, dir: number, age: number, reduced: boolean): PullFx | undefined {
  if (age < 0 || age > PULL_TICKS) return undefined;
  const s = side(dir);
  const out = Math.ceil(PULL_REACH / PULL_SPEED);
  const a = reduced ? out : age;
  const reach = a <= out ? Math.min(PULL_REACH, a * PULL_SPEED) : PULL_REACH - Math.min(1, (a - out) / (PULL_TICKS - out)) * PULL_DRAG;
  const wob = reduced ? 0 : age * 0.5;
  const alpha = fade(reduced ? 0.5 : age / PULL_TICKS, reduced);
  const tendril: number[] = [];
  const suckers: Mote[] = [];
  const n = 14;
  const start = Math.min(PULL_TENDRIL_START_PX, 8 + reach / 2);
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    const px = x + s * (start + f * Math.max(0, reach - start + 8));
    const py = y + Math.sin(f * 9 - wob) * (4 + f * 8);
    tendril.push(px, py);
    if (i % 2 === 1 && f > 0.15) suckers.push({ x: px, y: py + 3, r: 1.5 + f * 1.2, a: 0.7 });
  }
  const tx = tendril[tendril.length - 2] ?? x;
  const ty = tendril[tendril.length - 1] ?? y;
  const bubbles: Mote[] = [];
  for (let i = 0; i < 8; i++) {
    const f = hash01(i, 91);
    bubbles.push({ x: x + s * (8 + f * reach), y: y - 6 - hash01(i, 92) * 16 - (reduced ? 6 : (age * (0.6 + hash01(i, 93))) % 24), r: 1.2 + hash01(i, 94) * 1.6, a: 0.7 });
  }
  return { tendril, tip: { x: tx, y: ty, r: 5 }, suckers, bubbles, alpha };
}

type Gfx = Phaser.GameObjects.Graphics;

export function paintBell(gfx: Gfx, glow: Gfx, b: BellFx): void {
  for (const r of b.rings) {
    gfx.lineStyle(6, 0x000000, 0.2 * r.a * b.alpha).strokeEllipse(b.centre.x, b.centre.y, r.r * 2, r.r * 1.5);
    gfx.lineStyle(2.5, BELL_COLOR, 0.65 * r.a * b.alpha).strokeEllipse(b.centre.x, b.centre.y, r.r * 2, r.r * 1.5);
    glow.lineStyle(10, BELL_COLOR, 0.1 * r.a * b.alpha).strokeEllipse(b.centre.x, b.centre.y, r.r * 2, r.r * 1.5);
  }
  paintEmbers(glow, b.motes.map((m) => ({ x: m.x, y: m.y, r: m.r, a: m.a * b.alpha })), BELL_COLOR, 0.9);
}

export function paintMote(gfx: Gfx, glow: Gfx, m: MoteFx): void {
  const pts = toPts(m.bolt);
  gfx.lineStyle(7, 0x000000, 0.2 * m.alpha).strokePoints(pts, false);
  gfx.lineStyle(3, MOTE_COLOR, 0.85 * m.alpha).strokePoints(pts, false);
  gfx.lineStyle(1, MOTE_CORE, 0.9 * m.alpha).strokePoints(pts, false);
  glow.lineStyle(12, MOTE_COLOR, 0.12 * m.alpha).strokePoints(pts, false);
  glow.fillStyle(MOTE_COLOR, 0.3 * m.alpha).fillCircle(m.head.x, m.head.y, m.head.r * 2.2);
  glow.fillStyle(MOTE_CORE, 0.9 * m.alpha).fillCircle(m.head.x, m.head.y, m.head.r);
  paintEmbers(glow, m.sparks.map((s) => ({ x: s.x, y: s.y, r: s.r, a: s.a * m.alpha })), MOTE_COLOR, 0.9);
}

export function paintPull(gfx: Gfx, glow: Gfx, p: PullFx): void {
  const pts = toPts(p.tendril);
  gfx.lineStyle(12, 0x000000, 0.3 * p.alpha).strokePoints(pts, false);
  gfx.lineStyle(7, PULL_COLOR, 0.9 * p.alpha).strokePoints(pts, false);
  gfx.lineStyle(2, 0x5a8a92, 0.5 * p.alpha).strokePoints(pts, false);
  glow.lineStyle(14, PULL_COLOR, 0.14 * p.alpha).strokePoints(pts, false);
  for (const s of p.suckers) gfx.fillStyle(PULL_SUCKER, s.a * 0.6 * p.alpha).fillCircle(s.x, s.y, s.r);
  gfx.fillStyle(0x10303c, 0.9 * p.alpha).fillCircle(p.tip.x, p.tip.y, p.tip.r);
  glow.fillStyle(PULL_COLOR, 0.3 * p.alpha).fillCircle(p.tip.x, p.tip.y, p.tip.r * 2.4);
  paintEmbers(glow, p.bubbles.map((b) => ({ x: b.x, y: b.y, r: b.r, a: b.a * p.alpha })), 0x6aa0a8, 0.8);
}
