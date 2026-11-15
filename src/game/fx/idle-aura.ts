import type { Box } from '../views/hero-scale';
import { tri } from '../views/pose-anim';
import type { IdleElement, IdleLook } from '../platform/idle-look';
import { ELEMENT_COLORS } from './element-colors';
import { hash01, mute } from './grim-fx';

/**
 * Idle element auras (idea idle-element-auras): what stands around a hero that is not casting. Pure geometry and timing (no
 * Phaser, no clock, no sim state, no trig, no Math.random): the arena view (idle-aura-view.ts) turns the parts into pooled
 * images and the line segments into one shared Graphics. Shape and motion code the element, not hue: fire is tall licks and
 * embers rising, air is zigzag arcs along the silhouette edge plus blinking sparks, earth is falling grit and a glowing floor
 * crack, water is beads that fall plus a slow sheen, void is diamonds drawn inward. Everything is written into preallocated
 * buffers. Reduced motion freezes the age, which gives a calm static composition.
 */

/** Which parts and line kinds each element may use. Disjoint from each other, from the ability auras and from the status icons. */
export const IDLE_SHAPES: Readonly<Record<IdleElement, readonly string[]>> = {
  fire: ['lick', 'ember', 'ash', 'smoke'],
  air: ['arc', 'spark', 'haze', 'kick', 'sonar'],
  earth: ['crack', 'grit', 'pebble', 'dust', 'leaf'],
  water: ['sheen', 'drop', 'puddle', 'ripple', 'bubble', 'mist'],
  void: ['diamond', 'glint'],
};
/** Shapes drawn as line segments; every other shape is a pooled image whose atlas frame has the shape's name. */
export const IDLE_LINE_SHAPES: readonly string[] = ['lick', 'arc', 'sonar', 'crack', 'sheen'];
export const IDLE_FRAMES: readonly string[] = Object.values(IDLE_SHAPES).flat().filter((s) => !IDLE_LINE_SHAPES.includes(s));

/** Line segment kinds (the last float of a segment). */
export const LineKind = { lick: 0, arc: 1, crack: 2, sheen: 3, sonar: 4 } as const;
export const LINE_STRIDE = 6; // x1, y1, x2, y2, alpha, kind

export type IdleTier = 'full' | 'phone' | 'min';
interface TierCaps {
  readonly parts: number;
  readonly bolts: number;
  readonly segs: number;
  /** Count multiplier of every particle group. */
  readonly mult: number;
}
export const TIER_CAPS: Readonly<Record<IdleTier, TierCaps>> = {
  full: { parts: 18, bolts: 2, segs: 40, mult: 1 },
  phone: { parts: 8, bolts: 1, segs: 15, mult: 0.45 },
  min: { parts: 4, bolts: 0, segs: 0, mult: 0.22 },
};
/** Four heroes at the full tier. */
export const MAX_PARTS_TOTAL = 72;
export const MAX_SEGS_TOTAL = 160;
export const HIGH_CONTRAST_PARTS = 6;
/** Summed alpha allowed over the inner 70 percent of the hero box (the face and hitbox must stay readable). */
export const INNER_ALPHA_MAX = 0.35;
export const CROWN_ALPHA_MAX = 0.3;
export const BOX_MARGIN = 0.25;

export interface IdlePart {
  x: number;
  y: number;
  /** Width in px; the atlas cell sets the aspect. */
  size: number;
  alpha: number;
  rot: number;
  frame: string;
  color: number;
  add: boolean;
  front: boolean;
}

export function makeParts(n: number): IdlePart[] {
  const a: IdlePart[] = [];
  for (let i = 0; i < n; i++) a.push({ x: 0, y: 0, size: 0, alpha: 0, rot: 0, frame: '', color: 0, add: false, front: false });
  return a;
}
export const PARTS: IdlePart[] = makeParts(MAX_PARTS_TOTAL);
export const LINES = new Float32Array(MAX_SEGS_TOTAL * LINE_STRIDE);

/** Per-hero inputs of one frame (one reusable object in the view). */
export interface IdleCtx {
  /** View ticks since the hero became active (fractional). */
  age: number;
  /** 0..1, how much the hero stands still (walking keeps 0.6 intensity). */
  stand: number;
  reduced: boolean;
  tier: IdleTier;
  /** Per-hero scatter salt, e.g. `entityId * 977 + spriteHash`. */
  salt: number;
  /** 1 east, -1 west. */
  face: number;
  /** Own-element patch under the hero: ground parts (puddle, crack, pebbles, dust) are suppressed. */
  noGround: boolean;
  highContrast: boolean;
  /** 1, or 0.4 while a status or ability aura is on the hero. */
  dim: number;
  /** Ticks since an air strike granted by the StrikeBudget began, or -1. */
  strike: number;
}
export function makeCtx(): IdleCtx {
  return { age: 0, stand: 1, reduced: false, tier: 'full', salt: 0, face: 1, noGround: false, highContrast: false, dim: 1, strike: -1 };
}

const COL: Readonly<Record<IdleElement, number>> = {
  fire: mute(ELEMENT_COLORS.fire), air: mute(ELEMENT_COLORS.air), earth: mute(ELEMENT_COLORS.earth),
  water: mute(ELEMENT_COLORS.water), void: mute(ELEMENT_COLORS.void),
};
const EMBER = mute(0xffb050, 0.7, 0.95);
const ASH = 0x6a6560;
const SMOKE = 0x4a4540;
const SEAM = 0xb8862e;
const DUST = 0x8a7e6a;
const LEAF = 0x6f7f45;
const FROST = 0x9fb4be;

/** Eight unit directions (no trig). */
const DIRS: readonly number[] = [1, 0, 0.7071, 0.7071, 0, 1, -0.7071, 0.7071, -1, 0, -0.7071, -0.7071, 0, -1, 0.7071, -0.7071];

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
const sstep = (e0: number, e1: number, v: number): number => {
  const u = clamp((v - e0) / (e1 - e0), 0, 1);
  return u * u * (3 - 2 * u);
};

/** Particle life 0..1 of group member `i`: a cycle of minP..maxP ticks with a per-member phase. Reduced motion holds mid-life. */
function life(i: number, salt: number, t: number, minP: number, maxP: number, reduced: boolean): number {
  if (reduced) return 0.5;
  const per = minP + hash01(i, salt + 11) * (maxP - minP);
  return (t / per + hash01(i, salt + 12)) % 1;
}
/** 0 at both ends of a life, 1 from a quarter in until three quarters. */
const env = (l: number): number => Math.min(1, tri(l) * 2);

function put(out: IdlePart[], i: number, cap: number, x: number, y: number, size: number, alpha: number, rot: number, frame: string, color: number, add: boolean, front: boolean): number {
  const p = i < cap ? out[i] : undefined;
  if (!p) return i;
  p.x = x;
  p.y = y;
  p.size = size;
  p.alpha = alpha;
  p.rot = rot;
  p.frame = frame;
  p.color = color;
  p.add = add;
  p.front = front;
  return i + 1;
}

/** Parts the hero's tier, box size and reduced state allow for a group of `base` at full. */
function count(base: number, c: IdleCtx, b: Box, reducedMax = base): number {
  const m = TIER_CAPS[c.tier].mult * (b.h < 40 ? 0.5 : 1);
  const n = Math.max(1, Math.round(base * m));
  return c.reduced ? Math.min(n, reducedMax) : n;
}

/**
 * Fills `out[start...]` with this hero's particles and returns how many it wrote (0 for no element or no intensity).
 * Positions stay within the box grown by 25 percent, the inner 70 percent carries at most 0.35 summed alpha and the head
 * zone only the fire crown (at most 0.3), so the hero's face and hit box stay readable.
 */
export function idleParts(look: IdleLook, b: Box, c: IdleCtx, out: IdlePart[], start: number): number {
  if (look.element === 'none' || look.amount <= 0) return 0;
  const el = look.element;
  const caps = TIER_CAPS[c.tier];
  const cap = start + (c.highContrast ? Math.min(caps.parts, HIGH_CONTRAST_PARTS) : caps.parts);
  const inten = look.amount * (0.6 + 0.4 * clamp(c.stand, 0, 1)) * c.dim;
  const t = c.reduced ? 0 : c.age;
  const sc = clamp(b.h / 90, 0.5, 1.6);
  const front = c.tier === 'full';
  const s = c.salt;
  const fx = (f: number): number => b.x + (c.face > 0 ? f : 1 - f) * b.w;
  const cx = b.x + b.w / 2;
  const by = b.y + b.h;
  let i = start;

  if (el === 'fire') {
    const crown = look.signature === 'emberCrown';
    if (look.signature === 'smokeBreath') {
      const mouth = look.mouth ?? [0.8, 0.3];
      const n = count(2, c, b, 1);
      for (let k = 0; k < n; k++) {
        const l = c.reduced ? 0.4 : ((t / 110 + k / n) % 1);
        i = put(out, i, cap, fx(mouth[0]) - c.face * l * 0.25 * b.w, b.y + mouth[1] * b.h - l * 0.5 * b.h, (4 + l * 8) * sc, 0.34 * env(l) * inten, 0, 'smoke', SMOKE, false, false);
      }
    }
    if (look.signature === 'moltenSeams') {
      const n = count(4, c, b, 3);
      for (let k = 0; k < n; k++) {
        const a = 0.3 * (c.reduced ? 0.8 : 0.5 + 0.5 * tri(t / 120 + hash01(k, s + 20))) * inten;
        i = put(out, i, cap, b.x + (0.25 + 0.5 * hash01(k, s + 21)) * b.w, b.y + (0.3 + 0.5 * hash01(k, s + 22)) * b.h, 3 * sc + 1, a, 0, 'ember', SEAM, true, front);
      }
    }
    const nE = count(6, c, b, 3);
    for (let k = 0; k < nE; k++) {
      const l = life(k, s, t, 80, 140, c.reduced);
      const rise = (0.3 + 0.2 * hash01(k, s + 30)) * b.h;
      const x0 = crown ? cx + (hash01(k, s + 31) - 0.5) * b.w * 0.5 : b.x + (0.15 + 0.7 * hash01(k, s + 31)) * b.w;
      const y0 = crown ? b.y + 0.12 * b.h : b.y + 0.35 * b.h;
      const drift = c.reduced ? 0 : (tri(t / 60 + hash01(k, s + 32)) - 0.5) * 0.1 * b.w;
      i = put(out, i, cap, x0 + drift, y0 - l * rise, (2 + 3 * hash01(k, s + 33)) * sc + 1, 0.6 * env(l) * inten, 0, 'ember', EMBER, true, front);
    }
    const nA = count(look.signature === 'moltenSeams' ? 3 : 2, c, b, 1);
    for (let k = 0; k < nA; k++) {
      const l = life(k, s + 40, t, 110, 170, c.reduced);
      i = put(out, i, cap, b.x + (0.2 + 0.6 * hash01(k, s + 41)) * b.w, b.y + (0.35 + 0.45 * l) * b.h, 2 * sc + 1, 0.4 * env(l) * inten, 0, 'ash', ASH, false, false);
    }
    if (look.signature !== 'smokeBreath') {
      const l = c.reduced ? 0.4 : ((t / 150 + hash01(0, s + 50)) % 1);
      i = put(out, i, cap, cx - c.face * l * 0.2 * b.w, b.y + 0.2 * b.h - l * 0.4 * b.h, (4 + l * 6) * sc, 0.26 * env(l) * inten, 0, 'smoke', SMOKE, false, false);
    }
  } else if (el === 'air') {
    const nS = count(4, c, b, 3);
    for (let k = 0; k < nS; k++) {
      const left = hash01(k, s + 60) < 0.5;
      const on = c.reduced ? 0.35 : tri(t / (25 + 10 * hash01(k, s + 61)) + hash01(k, s + 62)) > 0.5 ? 0.5 : 0.12;
      i = put(out, i, cap, b.x + (left ? 0.02 : 0.98) * b.w + (hash01(k, s + 63) - 0.5) * 0.08 * b.w, b.y + (0.3 + 0.55 * hash01(k, s + 64)) * b.h, 2 * sc + 1, on * inten, 0, 'spark', COL.air, true, front);
    }
    if (!c.noGround && look.signature === 'baseDust') {
      const n = count(2, c, b, 1);
      for (let k = 0; k < n; k++) {
        const l = life(k, s + 65, t, 80, 110, c.reduced);
        i = put(out, i, cap, cx + (k === 0 ? -1 : 1) * (0.15 + 0.3 * l) * b.w, by - 2 - l * 0.12 * b.h, (4 + l * 8) * sc, 0.3 * env(l) * inten, 0, 'kick', DUST, false, false);
      }
    }
    if (!c.highContrast) i = put(out, i, cap, cx, b.y + 0.55 * b.h, b.w * 1.2, 0.07 * inten, 0, 'haze', COL.air, true, false);
  } else if (el === 'earth') {
    const nG = count(5, c, b, 3);
    for (let k = 0; k < nG; k++) {
      const l = life(k, s, t, 60, 100, c.reduced);
      const side = hash01(k, s + 70) < 0.5 ? 0.12 : 0.88;
      i = put(out, i, cap, b.x + side * b.w + (hash01(k, s + 71) - 0.5) * 0.1 * b.w, b.y + (0.3 + 0.7 * l) * b.h, 2 * sc + 1, 0.5 * env(l) * inten, 0, 'grit', DUST, false, front);
    }
    if (look.signature === 'fallingLeaves') {
      const n = count(3, c, b, 2);
      for (let k = 0; k < n; k++) {
        const l = life(k, s + 72, t, 130, 190, c.reduced);
        const sway = (tri(l * 3 + hash01(k, s + 73)) - 0.5) * 0.3 * b.w;
        i = put(out, i, cap, b.x + (0.2 + 0.6 * hash01(k, s + 74)) * b.w + sway, b.y + (0.1 + 0.9 * l) * b.h, 4 * sc + 1, 0.6 * env(l) * inten, c.reduced ? 0.4 : sway * 0.05, 'leaf', LEAF, false, front);
      }
    }
    if (look.signature === 'hoverPebbles') {
      const n = count(3, c, b, 3);
      for (let k = 0; k < n; k++) {
        const bob = c.reduced ? 0 : (tri(t / 90 + hash01(k, s + 75)) - 0.5) * 3;
        i = put(out, i, cap, b.x + (k % 2 === 0 ? -0.08 : 1.08) * b.w, b.y + (0.35 + 0.3 * hash01(k, s + 76)) * b.h + bob, 3 * sc + 2, 0.55 * inten, 0, 'pebble', DUST, false, front);
      }
    } else if (!c.noGround) {
      const n = count(2, c, b, 2);
      for (let k = 0; k < n; k++) {
        const hop = c.reduced ? 0 : tri(t / 140 + hash01(k, s + 77)) * 1.5;
        i = put(out, i, cap, cx + (hash01(k, s + 78) - 0.5) * 0.9 * b.w, by - 2 - hop, 3 * sc + 2, 0.55 * inten, 0, 'pebble', DUST, false, false);
      }
    }
    if (!c.noGround && (look.signature === 'rubbleGlow' || look.signature === 'baseDust')) {
      const l = c.reduced ? 0.5 : (t % 120) / 120;
      if (l < 0.35) i = put(out, i, cap, cx, by - 3, (6 + l * 30) * sc, 0.3 * (1 - l / 0.35) * inten, 0, 'dust', DUST, false, false);
    }
  } else if (el === 'water') {
    const nD = count(4, c, b, 2);
    for (let k = 0; k < nD; k++) {
      const l = life(k, s, t, 75, 125, c.reduced);
      const x = b.x + (0.15 + 0.7 * hash01(k, s + 80)) * b.w;
      const hem = look.signature === 'icicleDrips' ? 0.9 : 0.55;
      i = put(out, i, cap, x, b.y + (hem - 0.15 + l * (1 - hem + 0.15)) * b.h, 2 * sc + 1, 0.5 * env(l) * inten, 0, 'drop', COL.water, false, front);
      if (k < 2 && !c.noGround && !c.reduced && l > 0.9) {
        const r = (l - 0.9) * 10;
        i = put(out, i, cap, x, by - 2, 0.35 * b.w * r, 0.3 * (1 - r) * inten, 0, 'ripple', COL.water, false, false);
      }
    }
    if (look.signature === 'slimeBubbles') {
      const n = count(3, c, b, 2);
      for (let k = 0; k < n; k++) {
        const l = life(k, s + 81, t, 90, 140, c.reduced);
        i = put(out, i, cap, cx + (hash01(k, s + 82) - 0.5) * 0.5 * b.w, by - l * 0.7 * b.h, (3 + 2 * hash01(k, s + 83)) * sc + 1, 0.4 * env(l) * inten, 0, 'bubble', COL.water, false, front);
      }
    }
    if (look.signature === 'frostBreath' && !c.highContrast) {
      const mouth = look.mouth ?? [0.8, 0.3];
      const l = c.reduced ? 0.4 : ((t / 120) % 1);
      i = put(out, i, cap, fx(mouth[0]) + c.face * l * 0.4 * b.w, b.y + mouth[1] * b.h - l * 0.1 * b.h, (4 + l * 10) * sc, 0.28 * env(l) * inten, 0, 'mist', FROST, false, false);
    }
    if (!c.noGround) i = put(out, i, cap, cx, by - 2, b.w * 0.9, (0.18 + (c.reduced ? 0 : 0.06 * tri(t / 90))) * inten, 0, 'puddle', COL.water, false, false);
  } else {
    const nM = count(5, c, b, 3);
    const rad = b.w * 0.9;
    for (let k = 0; k < nM; k++) {
      const l = life(k, s, t, 100, 160, c.reduced);
      const d = Math.floor(hash01(k, s + 90) * 8) * 2;
      const dx = DIRS[d] ?? 1;
      const dy = DIRS[d + 1] ?? 0;
      const r = (1 - l) * rad;
      const swirl = l * (1 - l) * rad * 0.6;
      i = put(out, i, cap, cx + dx * r - dy * swirl, b.y + 0.5 * b.h + dy * r * 0.8 + dx * swirl * 0.8, (2 + 2 * hash01(k, s + 91)) * sc + 1, 0.5 * env(l) * inten, 0, 'diamond', COL.void, true, front);
    }
    i = put(out, i, cap, cx, b.y + 0.15 * b.h, 5 * sc + 2, (c.reduced ? 0.3 : 0.5 * tri(t / 150)) * inten, 0, 'glint', COL.void, true, false);
  }
  return finish(b, el, out, start, i);
}

/** Final pass: keep parts near the box, soften the head zone and cap the alpha over the inner 70 percent. */
function finish(b: Box, el: IdleElement, out: IdlePart[], start: number, end: number): number {
  const x0 = b.x - BOX_MARGIN * b.w;
  const x1 = b.x + (1 + BOX_MARGIN) * b.w;
  const y0 = b.y - BOX_MARGIN * b.h;
  const y1 = b.y + (1 + BOX_MARGIN) * b.h;
  const top = b.y + 0.2 * b.h;
  let inner = 0;
  for (let i = start; i < end; i++) {
    const p = out[i];
    if (!p) continue;
    p.x = clamp(p.x, x0, x1);
    p.y = clamp(p.y, y0, y1);
    const u = sstep(top, top + 0.1 * b.h, p.y);
    if (p.y < top + 0.1 * b.h) p.alpha *= el === 'fire' ? Math.min(1, (CROWN_ALPHA_MAX + (1 - CROWN_ALPHA_MAX) * u) / Math.max(p.alpha, 1e-6)) : u;
    if (p.x >= b.x + 0.15 * b.w && p.x <= b.x + 0.85 * b.w && p.y >= b.y + 0.15 * b.h && p.y <= b.y + 0.85 * b.h) inner += p.alpha;
  }
  if (inner > INNER_ALPHA_MAX) {
    const f = INNER_ALPHA_MAX / inner;
    for (let i = start; i < end; i++) {
      const p = out[i];
      if (p && p.x >= b.x + 0.15 * b.w && p.x <= b.x + 0.85 * b.w && p.y >= b.y + 0.15 * b.h && p.y <= b.y + 0.85 * b.h) p.alpha *= f;
    }
  }
  return end - start;
}

function seg(lines: Float32Array, n: number, cap: number, x1: number, y1: number, x2: number, y2: number, a: number, kind: number): number {
  if (n >= cap) return n;
  const o = n * LINE_STRIDE;
  lines[o] = x1;
  lines[o + 1] = y1;
  lines[o + 2] = x2;
  lines[o + 3] = y2;
  lines[o + 4] = a;
  lines[o + 5] = kind;
  return n + 1;
}

/**
 * Writes this hero's line shapes (licks, arcs, cracks, sheen, sonar ring) into `lines` from segment `start` and returns how
 * many segments it wrote. Alphas are final (intensity applied), strikes at most 0.55.
 */
export function idleLines(look: IdleLook, b: Box, c: IdleCtx, lines: Float32Array, start: number): number {
  if (look.element === 'none' || look.amount <= 0) return 0;
  const el = look.element;
  const caps = TIER_CAPS[c.tier];
  const room = Math.min(caps.segs, Math.floor(lines.length / LINE_STRIDE) - start);
  const cap = start + Math.max(0, room);
  const inten = look.amount * (0.6 + 0.4 * clamp(c.stand, 0, 1)) * c.dim;
  const t = c.reduced ? 0 : c.age;
  const s = c.salt;
  const cx = b.x + b.w / 2;
  const by = b.y + b.h;
  let n = start;

  if (el === 'fire') {
    const nL = count(4, c, b, 2);
    for (let k = 0; k < nL; k++) {
      const crown = k >= 2;
      const bx = b.x + (crown ? (k === 2 ? 0.4 : 0.6) : k === 0 ? 0.15 : 0.85) * b.w;
      const base = b.y + (crown ? 0.12 : 0.32) * b.h;
      const bw = b.w * 0.14;
      const flick = c.reduced ? 0.5 : tri(t / (18 + 7 * k) + hash01(k, s + 100));
      const th = (0.14 + 0.08 * flick) * b.h;
      const tx = bx + (c.reduced ? 0 : (tri(t / (30 + 5 * k) + hash01(k, s + 101)) - 0.5) * bw * 0.8);
      const a = (crown ? 0.28 : 0.4) * (0.7 + 0.3 * flick) * inten;
      n = seg(lines, n, cap, bx - bw / 2, base, tx, base - th, a, LineKind.lick);
      n = seg(lines, n, cap, tx, base - th, bx + bw / 2, base, a, LineKind.lick);
      n = seg(lines, n, cap, bx + bw / 2, base, bx - bw / 2, base, a * 0.6, LineKind.lick);
    }
  } else if (el === 'air') {
    if (!c.reduced && c.strike >= 0 && caps.bolts > 0) {
      const a = 0.5 * Math.min(1, inten) * (1 - c.strike / 6);
      const nB = Math.min(caps.bolts, hash01(c.strike, s + 110) < 0.5 ? 1 : 2);
      for (let k = 0; k < nB; k++) {
        const left = hash01(k, s + 111) < 0.5;
        let x = b.x + (left ? 0.03 : 0.97) * b.w;
        let y = b.y + (0.2 + 0.2 * hash01(k, s + 112)) * b.h;
        for (let j = 0; j < 6; j++) {
          const nx = b.x + (left ? 0.03 : 0.97) * b.w + (hash01(j, s + 113 + k * 31) - 0.5) * 0.16 * b.w;
          const ny = y + 0.09 * b.h;
          n = seg(lines, n, cap, x, y, nx, ny, a, LineKind.arc);
          x = nx;
          y = ny;
        }
        // One short branch off the middle of the bolt.
        n = seg(lines, n, cap, x, y, x + (left ? 0.1 : -0.1) * b.w, y + 0.05 * b.h, a * 0.7, LineKind.arc);
        n = seg(lines, n, cap, x + (left ? 0.1 : -0.1) * b.w, y + 0.05 * b.h, x + (left ? 0.15 : -0.15) * b.w, y + 0.12 * b.h, a * 0.5, LineKind.arc);
      }
    }
    if (look.signature === 'sonarPing' && !c.reduced) {
      const l = (t % 120) / 120;
      const r = l * 0.9 * b.w;
      for (let d = 0; d < 8; d++) {
        const e = (d + 1) % 8;
        n = seg(lines, n, cap, cx + (DIRS[d * 2] ?? 0) * r, b.y + 0.5 * b.h + (DIRS[d * 2 + 1] ?? 0) * r, cx + (DIRS[e * 2] ?? 0) * r, b.y + 0.5 * b.h + (DIRS[e * 2 + 1] ?? 0) * r, 0.3 * (1 - l) * inten, LineKind.sonar);
      }
    }
  } else if (el === 'earth') {
    if (!c.noGround) {
      const a = (c.reduced ? 0.3 : 0.18 + 0.2 * tri(t / 120)) * inten;
      let x = cx - 0.35 * b.w;
      let y = by - 3;
      for (let j = 0; j < 6; j++) {
        const nx = x + (0.12 * b.w) * (1 + hash01(j, s + 120) * 0.4);
        const ny = by - 3 + (hash01(j, s + 121) - 0.3) * 4;
        n = seg(lines, n, cap, x, y, nx, ny, a, LineKind.crack);
        x = nx;
        y = ny;
      }
    }
  } else if (el === 'water') {
    if (!c.reduced && !c.highContrast) {
      const l = (t / 150) % 1;
      const x = b.x + (l * 1.2 - 0.1) * b.w;
      n = seg(lines, n, cap, x, b.y + 0.15 * b.h, x, b.y + 0.85 * b.h, 0.16 * Math.min(1, inten) * sstep(0, 0.15, l) * (1 - sstep(0.85, 1, l)), LineKind.sheen);
    }
  }
  const out = n - start;
  // Keep every segment end near the box too (the same 25 percent margin as the parts).
  const x0 = b.x - BOX_MARGIN * b.w;
  const x1 = b.x + (1 + BOX_MARGIN) * b.w;
  const y0 = b.y - BOX_MARGIN * b.h;
  const y1 = b.y + (1 + BOX_MARGIN) * b.h;
  for (let k = start * LINE_STRIDE; k < n * LINE_STRIDE; k += LINE_STRIDE) {
    lines[k] = clamp(lines[k] ?? 0, x0, x1);
    lines[k + 1] = clamp(lines[k + 1] ?? 0, y0, y1);
    lines[k + 2] = clamp(lines[k + 2] ?? 0, x0, x1);
    lines[k + 3] = clamp(lines[k + 3] ?? 0, y0, y1);
  }
  return out;
}

/** Air strike schedule: one strike every 40..80 ticks per hero (0.8-1.6 s), 3..5 ticks long, at least 17 ticks apart. */
export const STRIKE_MIN_GAP_TICKS = 17;
export const STRIKE_GLOBAL_MAX = 3;
export const STRIKE_GLOBAL_WINDOW_TICKS = 50;
export function strikePeriod(salt: number): number {
  return 40 + Math.floor(hash01(0, salt + 101) * 41);
}
/** Ticks since the scheduled strike of this hero began (0 on its first tick), or -1 when none is on. */
export function strikeAge(salt: number, tick: number): number {
  if (tick < 0) return -1;
  const p = strikePeriod(salt);
  const n = Math.floor(tick / p);
  const startTick = n * p + Math.floor(hash01(n, salt + 102) * (p - 16));
  const dur = 3 + Math.floor(hash01(n, salt + 103) * 3);
  const age = tick - startTick;
  return age >= 0 && age < dur ? age : -1;
}

/**
 * Flash limiter for idle strikes (WCAG 2.3.1): per hero at least 17 ticks apart, and across all heroes at most 3 starts in
 * any 50 ticks (one second). Ask once, on the tick `strikeAge` is 0; a refused strike simply does not happen.
 */
export class StrikeBudget {
  private readonly last = new Int32Array(8).fill(-1_000_000);
  private readonly ring = new Int32Array(STRIKE_GLOBAL_MAX).fill(-1_000_000);
  private head = 0;
  private prev = 0;

  allow(slot: number, tick: number): boolean {
    if (tick < this.prev) this.clear();
    this.prev = tick;
    const s = slot & 7;
    if (tick - (this.last[s] ?? 0) < STRIKE_MIN_GAP_TICKS) return false;
    if (tick - (this.ring[this.head] ?? 0) < STRIKE_GLOBAL_WINDOW_TICKS) return false;
    this.last[s] = tick;
    this.ring[this.head] = tick;
    this.head = (this.head + 1) % STRIKE_GLOBAL_MAX;
    return true;
  }

  clear(): void {
    this.last.fill(-1_000_000);
    this.ring.fill(-1_000_000);
    this.head = 0;
    this.prev = 0;
  }
}

const TIER_ORDER: readonly IdleTier[] = ['full', 'phone', 'min'];
/** The slowest frame delta (ms, smoothed over about 2 s) the governor accepts before it steps a tier down. */
export const GOVERNOR_SLOW_MS = 24;
/**
 * The fx tier: phone for a coarse pointer or 4 or fewer cores (`cores` 0 is unknown), then the governor: when the smoothed
 * frame delta is over 24 ms it steps one tier down. Never steps back up (`current` is the tier in use this match). Call it
 * once per sustained 2 s window, not every frame.
 */
export function fxTier(coarse: boolean, cores: number, avgDeltaMs: number, current?: IdleTier): IdleTier {
  let idx = coarse || (cores > 0 && cores <= 4) ? 1 : 0;
  if (current) idx = Math.max(idx, TIER_ORDER.indexOf(current));
  if (avgDeltaMs > GOVERNOR_SLOW_MS) idx = Math.min(TIER_ORDER.length - 1, idx + 1);
  return TIER_ORDER[idx] ?? 'min';
}
