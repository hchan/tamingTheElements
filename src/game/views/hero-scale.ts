/**
 * Arcade hero presentation size (view only; sim boxes never change). Fighting games keep the fighters at about a third of the
 * picture height, so the sprite is drawn bigger than its hitbox, anchored at the feet centre (as Classic's 1.4x already is).
 * Pure: no Phaser, so Node tests and the FX views share it.
 */

/** Display scale of a 1x hero (box 80 px high): about 30% of the 460 px arena strip at 1280x720. */
export const ARCADE_HERO_SCALE = 2;
/** A big body (giant, up to 4x the box) never grows past this display height (world px). */
export const ARCADE_HERO_MAX_H = 200;
/** Smallest scale any body gets, so a giant still reads as bigger than a normal hero. */
export const ARCADE_HERO_MIN_SCALE = 1.25;

/** Display scale for a body with sim box height `h`. */
export function arcadeHeroScale(h: number): number {
  if (h <= 0) return ARCADE_HERO_SCALE;
  return Math.max(ARCADE_HERO_MIN_SCALE, Math.min(ARCADE_HERO_SCALE, ARCADE_HERO_MAX_H / h));
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * The box the sprite shows in: the sim box grown by `k` about the feet centre. FX that hug the body (auras, status marks,
 * aim ring, guard bubble) use this so they stay on the bigger sprite. `out` is filled and returned (no allocation).
 */
export function visualBox(x: number, y: number, w: number, h: number, k: number, out: Box): Box {
  out.x = x - (w * (k - 1)) / 2;
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
