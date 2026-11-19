/**
 * Arcade hero presentation size (view only; sim boxes never change). Fighting games keep the fighters at about a third of the
 * picture height, so the sprite is drawn bigger than its hitbox, anchored at the feet centre (as Classic's 1.4x already is).
 * Pure: no Phaser, so Node tests and the FX views share it.
 */

/** Phaser object name of a hero's body image, so the super band (fx) can find every fighter on the display list. */
export const HERO_IMAGE_NAME = 'tteHero';

/** Display scale of a 1x hero (box 80 px high): about 30% of the 460 px arena strip at 1280x720. */
export const ARCADE_HERO_SCALE = 2;
/** A big body (giant, up to 4x the box) never grows past this display height (world px). */
export const ARCADE_HERO_MAX_H = 200;
/** Smallest scale any body gets, so a giant still reads as bigger than a normal hero. */
export const ARCADE_HERO_MIN_SCALE = 1.25;

/** Display scale for a body with sim box height `h`. */
export function arcadeHeroScale(h: number): number {
  if (h <= 0) return ARCADE_HERO_SCALE * heroBoost;
  return Math.max(ARCADE_HERO_MIN_SCALE, Math.min(ARCADE_HERO_SCALE, ARCADE_HERO_MAX_H / h)) * heroBoost;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Shifts a drawn box's `left` so `[left, left + width]` stays inside `[0, worldW]` (WP-HC1): the 2x sprite of a hero pressed
 * against a wall would otherwise hang half its body off the picture. The sim box is untouched; the shift is at most
 * w(k-1)/2 for a sim box inside the world, and zero at k = 1. A box wider than the world is left alone.
 */
export function wallTuck(left: number, width: number, worldW: number): number {
  if (width >= worldW) return left;
  return Math.min(worldW - width, Math.max(0, left));
}

/**
 * The box the sprite shows in: the sim box grown by `k` about the feet centre. FX that hug the body (auras, status marks,
 * aim ring, guard bubble) use this so they stay on the bigger sprite. `out` is filled and returned (no allocation).
 */
export function visualBox(x: number, y: number, w: number, h: number, k: number, out: Box, worldW?: number): Box {
  out.x = x - (w * (k - 1)) / 2;
  if (worldW !== undefined) out.x = wallTuck(out.x, w * k, worldW);
  out.y = y - h * (k - 1);
  out.w = w * k;
  out.h = h * k;
  return out;
}

/**
 * Sheets with a frame larger than the body (the portrait rigs: 240 px frames with overscan for wings, tails and spell reach)
 * carry a `box`: the frame-space rect that maps onto the visual box. It rides on the texture frame's `customData` (set where
 * the sheet frames are registered, copied to the graded texture), so every view that draws or copies a hero frame sizes it
 * the same way. Frames without one (legacy strips, 80 px sheets) fill the visual box, as before.
 */
export const FRAME_BOX_KEY = 'tteBox';

/** The structural part of a Phaser texture frame / image these helpers use (keeps this module free of Phaser). */
export interface BoxedFrame {
  readonly width: number;
  readonly height: number;
  readonly customData: object;
}
export interface BoxedImage {
  readonly x: number;
  readonly y: number;
  readonly flipX: boolean;
  readonly displayWidth: number;
  readonly displayHeight: number;
  readonly frame: BoxedFrame;
  setPosition(x: number, y: number): unknown;
  setDisplaySize(w: number, h: number): unknown;
}

/** The frame's box (frame px), or undefined when the frame is the box. */
export function frameBox(f: BoxedFrame): Readonly<Box> | undefined {
  // a frame stub without custom data (unit-test fakes) is unboxed
  const data = f.customData as Record<string, unknown> | undefined;
  const b = data?.[FRAME_BOX_KEY] as Box | undefined;
  return b !== undefined && (b.w !== f.width || b.h !== f.height) ? b : undefined;
}

/** Records `box` on texture frame `f` (see FRAME_BOX_KEY). */
export function setFrameBox(f: BoxedFrame, box: Readonly<Box>): void {
  (f.customData as Record<string, unknown>)[FRAME_BOX_KEY] = { x: box.x, y: box.y, w: box.w, h: box.h };
}

/**
 * Draws `img`'s current frame so that its box lands on the visual box (x, y, w, h), mirrored with `img.flipX` (set the flip
 * first). A frame without a box simply fills the visual box.
 */
export function fitToBox(img: BoxedImage, x: number, y: number, w: number, h: number): void {
  const f = img.frame;
  const b = frameBox(f);
  if (b === undefined) {
    img.setPosition(x, y);
    img.setDisplaySize(w, h);
    return;
  }
  const sx = w / b.w;
  const sy = h / b.h;
  const left = img.flipX ? f.width - b.x - b.w : b.x;
  img.setDisplaySize(f.width * sx, f.height * sy);
  img.setPosition(x - left * sx, y - b.y * sy);
}

/** The visual box of a drawn (unrotated) hero image: its frame's box in world px, or the whole image. Fills `out`. */
export function drawnBox(img: BoxedImage, out: Box): Box {
  const f = img.frame;
  const b = frameBox(f);
  if (b === undefined || f.width <= 0 || f.height <= 0) {
    out.x = img.x;
    out.y = img.y;
    out.w = img.displayWidth;
    out.h = img.displayHeight;
    return out;
  }
  const sx = img.displayWidth / f.width;
  const sy = img.displayHeight / f.height;
  const left = img.flipX ? f.width - b.x - b.w : b.x;
  out.x = img.x + left * sx;
  out.y = img.y + b.y * sy;
  out.w = b.w * sx;
  out.h = b.h * sy;
  return out;
}

/** The horizontal extent of a drawn body, in world px. */
export interface SpanX {
  min: number;
  max: number;
}

/**
 * The world-x extent of the drawn visual box of `img` when rotated by `rotation` radians about its top-left corner (the
 * pose layer's own pivot is applied before this, so the image origin is (0, 0) and there is no parent container: both hold
 * for the hero images, `character-view.ts`). A boxed frame spans its box, an unboxed one the whole quad. At rotation 0 this
 * equals `drawnBox`. Fills `out` (no allocation).
 */
export function boxSpanX(img: BoxedImage, rotation: number, out: SpanX): SpanX {
  const f = img.frame;
  const b = frameBox(f);
  let u0 = 0;
  let u1 = img.displayWidth;
  let v0 = 0;
  let v1 = img.displayHeight;
  if (b !== undefined && f.width > 0 && f.height > 0) {
    const sx = img.displayWidth / f.width;
    const sy = img.displayHeight / f.height;
    u0 = (img.flipX ? f.width - b.x - b.w : b.x) * sx;
    u1 = u0 + b.w * sx;
    v0 = b.y * sy;
    v1 = (b.y + b.h) * sy;
  }
  const c = Math.cos(rotation);
  const s = Math.sin(rotation);
  const x00 = img.x + u0 * c - v0 * s;
  const x10 = img.x + u1 * c - v0 * s;
  const x01 = img.x + u0 * c - v1 * s;
  const x11 = img.x + u1 * c - v1 * s;
  out.min = Math.min(x00, x10, x01, x11);
  out.max = Math.max(x00, x10, x01, x11);
  return out;
}

/** The shift that puts `[min, max]` inside `[lo, hi]`; 0 when it already is, or when the span is wider than the room. */
export function clampSpanX(min: number, max: number, lo: number, hi: number): number {
  if (max - min >= hi - lo) return 0;
  if (min < lo) return lo - min;
  if (max > hi) return hi - max;
  return 0;
}

/** Portrait phone tall view: heroes are drawn this much bigger still (view only), since the narrow view leaves the sky above the arena empty (qa-r113 P2). */
export const PORTRAIT_HERO_BOOST = 1.6;
let heroBoost = 1;

/** The extra hero draw multiplier for the tall portrait view (1 everywhere else: landscape and desktop are unchanged). */
export function portraitHeroBoost(tall: boolean): number {
  return tall ? PORTRAIT_HERO_BOOST : 1;
}

/** Sets the extra hero draw multiplier every `arcadeHeroScale` caller sees (the pan camera sets it each frame and resets it on shutdown). */
export function setHeroBoost(k: number): void {
  heroBoost = k > 0 ? k : 1;
}
