import type { Element } from '@core/index';
import { hash01, mute } from './grim-fx';

/**
 * Pure model of the Cleanse animation on the casting hero (view only; the sim just says "this hero cleansed" with an element).
 * One short scene per element, each a few dozen primitives in a reused pool, so it allocates nothing per frame:
 * water a drop falls and a film washes down the body; fire a burn line climbs the body and throws embers and ash; earth a stone
 * shell closes, cracks and falls apart; air gust streaks sweep across the hero and blow flecks away. Colours are the grim grade
 * (muted, dark), shapes carry the element (never colour alone). Reduced motion paints one still frame of the same scene
 * (nothing moves) and only fades it out. Ages count view ticks, so a paused match holds the frame.
 */

export const CLEANSE_TICKS = 44;
/** Effects alive at once (a mirror match casts two); the oldest gives way. */
export const CLEANSE_POOL = 6;
export const MAX_PARTS = 48;

/** The `cleanse` event's `element` field (1 fire, 2 water, 3 earth, 4 air, 5 void) as an Element. */
const KIND_ELEMENT: readonly Element[] = ['void', 'fire', 'water', 'earth', 'air', 'void'];
export const elementOfCleanse = (kind: number): Element => KIND_ELEMENT[kind] ?? 'void';

export const CleanseShape = { drop: 0, flame: 1, shard: 2, ring: 3, line: 4, mote: 5 } as const;

export interface CleansePart {
  shape: number;
  x: number;
  y: number;
  /** line: end point; ring: width and height; shard: rotation in x2. */
  x2: number;
  y2: number;
  s: number;
  a: number;
  color: number;
}

export interface Box {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

const COLORS = {
  water: mute(0x4f86b4, 0.55, 0.95),
  fire: mute(0xd8631f, 0.6, 0.9),
  ember: mute(0xe0a050, 0.6, 0.95),
  earth: mute(0x9a7a4c, 0.55, 0.85),
  air: mute(0xbcd2da, 0.5, 0.9),
  ash: 0x3a3733,
};

export const parts: CleansePart[] = [];
let used = 0;

function add(shape: number, x: number, y: number, x2: number, y2: number, s: number, a: number, color: number): void {
  if (used >= MAX_PARTS || a <= 0.01) return;
  let p = parts[used];
  if (!p) {
    p = { shape, x, y, x2, y2, s, a, color };
    parts[used] = p;
  } else {
    p.shape = shape;
    p.x = x;
    p.y = y;
    p.x2 = x2;
    p.y2 = y2;
    p.s = s;
    p.a = a;
    p.color = color;
  }
  used++;
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const ease = (t: number): number => 1 - (1 - clamp01(t)) * (1 - clamp01(t));

/** Whole-scene alpha: quick fade in, longer fade out; in reduced motion the still frame holds, then fades. */
export function cleanseFade(age: number, reduced: boolean): number {
  const p = age / CLEANSE_TICKS;
  if (reduced) return p < 0.7 ? 1 : clamp01((1 - p) / 0.3);
  return clamp01(p / 0.1) * clamp01((1 - p) / 0.25);
}

/** Scene progress 0..1; a still mid-scene frame in reduced motion. */
export const cleanseProgress = (age: number, reduced: boolean): number => (reduced ? 0.5 : clamp01(age / CLEANSE_TICKS));

function water(b: Box, p: number, f: number, seed: number): void {
  const cx = b.x + b.w / 2;
  const fall = ease(p / 0.3);
  add(CleanseShape.drop, cx, b.y - 30 + 32 * fall, 0, 0, 6, (p < 0.3 ? 1 : clamp01(1 - (p - 0.3) / 0.1)) * f, COLORS.water);
  const wp = clamp01((p - 0.28) / 0.72);
  if (p < 0.28) return;
  const sweep = b.y + b.h * wp;
  add(CleanseShape.ring, cx, sweep, b.w * 1.15, 9, 0, 0.8 * (1 - wp * 0.4) * f, COLORS.water);
  add(CleanseShape.ring, cx, sweep - 11, b.w * 0.95, 7, 0, 0.4 * (1 - wp * 0.4) * f, COLORS.water);
  for (let i = 0; i < 8; i++) {
    const y0 = b.y + b.h * (0.1 + hash01(i, seed) * 0.5);
    add(CleanseShape.mote, b.x + hash01(i, seed + 1) * b.w, y0 + wp * b.h * 0.8 * (0.5 + hash01(i, seed + 2)), 0, 0, 1.5, (1 - wp) * f, COLORS.water);
  }
}

function fire(b: Box, p: number, f: number, seed: number): void {
  const cx = b.x + b.w / 2;
  const line = b.y + b.h * (1 - p);
  for (let i = 0; i < 5; i++) {
    const tall = 14 + hash01(i, seed) * 10;
    add(CleanseShape.flame, cx + (i - 2) * b.w * 0.22, line + hash01(i, seed + 1) * 6, 0, 0, tall * (1 - 0.4 * p), 0.8 * f, COLORS.fire);
  }
  for (let i = 0; i < 10; i++) {
    const rise = p * 50 * (0.6 + hash01(i, seed + 2));
    add(CleanseShape.mote, b.x + hash01(i, seed + 3) * b.w + (hash01(i, seed + 4) - 0.5) * 14 * p, b.y + hash01(i, seed + 5) * b.h - rise, 0, 0, 1.2 + hash01(i, seed + 6), (1 - p) * f, COLORS.ember);
  }
  for (let i = 0; i < 6; i++) {
    add(CleanseShape.shard, b.x + hash01(i, seed + 7) * b.w, b.y + hash01(i, seed + 8) * b.h * 0.6 + p * 40 * (0.5 + hash01(i, seed + 9)), p * 3 + i, 0, 2.2, 0.7 * (1 - p) * f, COLORS.ash);
  }
}

function earth(b: Box, p: number, f: number, seed: number): void {
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const close = ease(p / 0.35);
  const fall = clamp01((p - 0.6) / 0.4);
  const jitter = p > 0.35 && p < 0.6 ? (hash01(Math.floor(p * 100), seed) - 0.5) * 2 : 0;
  for (let i = 0; i < 6; i++) {
    const ang = (i / 6) * Math.PI * 2 + 0.4;
    const spread = (1.5 - 0.5 * close) + fall * 0.55;
    const rot = ang + fall * (1 + i * 0.3);
    add(
      CleanseShape.shard, cx + Math.cos(ang) * b.w * 0.62 * spread + jitter, cy + Math.sin(ang) * b.h * 0.55 * spread + fall * fall * 34, rot, 0,
      b.w * 0.2, (0.35 + 0.65 * close) * (1 - fall) * f, COLORS.earth,
    );
  }
  if (p > 0.35 && p < 0.7) {
    const g = clamp01((p - 0.35) / 0.25);
    for (let i = 0; i < 3; i++) {
      const ang = (i / 3) * Math.PI * 2 + 1.1;
      const sx = cx + Math.cos(ang) * b.w * 0.5;
      const sy = cy + Math.sin(ang) * b.h * 0.45;
      add(CleanseShape.line, sx, sy, sx + (cx - sx) * 0.7 * g + (hash01(i, seed) - 0.5) * 8, sy + (cy - sy) * 0.7 * g, 1.6, 0.9 * f, COLORS.ash);
    }
  }
  if (fall > 0) for (let i = 0; i < 6; i++) add(CleanseShape.mote, cx + (hash01(i, seed + 1) - 0.5) * b.w * 1.4, b.y + b.h * (0.6 + hash01(i, seed + 2) * 0.4) + fall * 10, 0, 0, 1.6, (1 - fall) * 0.7 * f, COLORS.earth);
}

function air(b: Box, p: number, f: number, seed: number): void {
  const cy = b.y + b.h / 2;
  for (let k = 0; k < 3; k++) {
    const head = b.x - 40 + clamp01(p * 1.25 - k * 0.1) * (b.w + 130);
    const yk = cy + (k - 1) * b.h * 0.28;
    let px = head;
    let py = yk;
    for (let j = 1; j <= 6; j++) {
      const x = head - j * 14;
      const y = yk + Math.sin(j * 0.9 + k * 2) * 4;
      add(CleanseShape.line, px, py, x, y, 2.4 * (1 - j / 7), (1 - j / 7) * 0.8 * f, COLORS.air);
      px = x;
      py = y;
    }
  }
  for (let i = 0; i < 8; i++) {
    add(CleanseShape.mote, b.x + hash01(i, seed) * b.w + p * p * 90 * (0.6 + hash01(i, seed + 1)), b.y + hash01(i, seed + 2) * b.h - p * 10, 0, 0, 1.4, (1 - p) * f, COLORS.air);
  }
}

/**
 * Fills the shared `parts` pool for one effect on hero box `b` at `age` view ticks and returns how many are live. `seed` (the
 * hero's entity id) keeps two casts from looking identical. An element with no scene (void) draws nothing.
 */
export function cleanseParts(element: Element, b: Box, age: number, reduced: boolean, seed: number): number {
  used = 0;
  if (age < 0 || age >= CLEANSE_TICKS) return 0;
  const p = cleanseProgress(age, reduced);
  const f = cleanseFade(age, reduced);
  const s = seed * 17 + 3;
  switch (element) {
    case 'water':
      water(b, p, f, s);
      break;
    case 'fire':
      fire(b, p, f, s);
      break;
    case 'earth':
      earth(b, p, f, s);
      break;
    case 'air':
      air(b, p, f, s);
      break;
    default:
      break;
  }
  return used;
}

export interface CleanseEffect {
  id: number;
  element: Element;
  born: number;
}

/** The running effects: one per hero (a new cast restarts it), at most CLEANSE_POOL, the oldest replaced. */
export class CleanseFx {
  readonly live: CleanseEffect[] = [];

  start(id: number, element: Element, now: number): void {
    const at = this.live.findIndex((e) => e.id === id);
    if (at >= 0) this.live.splice(at, 1);
    else if (this.live.length >= CLEANSE_POOL) this.live.shift();
    this.live.push({ id, element, born: now });
  }

  /** Drops the finished ones (and any born in the future, after a rewind). */
  prune(now: number): void {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const e = this.live[i];
      if (e && (now - e.born >= CLEANSE_TICKS || now < e.born)) this.live.splice(i, 1);
    }
  }
}
