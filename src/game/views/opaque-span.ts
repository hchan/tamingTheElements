/**
 * Opaque horizontal extent of a sheet frame (view only; opaque-bbox-tuck). The wall tuck used the frame's visual box, so the
 * transparent padding of a portrait-rig frame left a gap at the wall, and art that overscans the box (wings, tails) clipped.
 * The extent is measured once per frame when the atlas registers and rides on the frame's `customData`.
 */

/** customData key holding `[x0, x1]` in frame px: the first and one past the last column that has an opaque texel. */
export const FRAME_OPAQUE_KEY = 'tteOpaqueX';
/** A texel counts as opaque from this alpha (0-255), so a faint glow halo does not hold a hero off the wall. */
export const OPAQUE_ALPHA_MIN = 32;

/**
 * Columns `[x0, x1)` holding an opaque texel in the `w` x `h` RGBA block `rgba` (row-major, 4 bytes a texel), or undefined for
 * a fully transparent block.
 */
export function opaqueColumns(rgba: ArrayLike<number>, w: number, h: number, alphaMin = OPAQUE_ALPHA_MIN): readonly [number, number] | undefined {
  let lo = w;
  let hi = -1;
  for (let y = 0; y < h; y++) {
    const row = y * w * 4;
    for (let x = 0; x < w; x++) {
      if ((rgba[row + x * 4 + 3] ?? 0) < alphaMin) continue;
      if (x < lo) lo = x;
      if (x > hi) hi = x;
    }
  }
  return hi < 0 ? undefined : [lo, hi + 1];
}

/** The structural part of a texture frame these helpers use. */
export interface OpaqueFrame {
  readonly width: number;
  readonly customData: object;
}

/** Records the opaque columns on frame `f`. */
export function setFrameOpaque(f: OpaqueFrame, cols: readonly [number, number]): void {
  (f.customData as Record<string, unknown>)[FRAME_OPAQUE_KEY] = [cols[0], cols[1]];
}

/** The frame's opaque columns (frame px), or undefined when unmeasured (legacy strips, test fakes). */
export function frameOpaque(f: OpaqueFrame): readonly [number, number] | undefined {
  const v = (f.customData as Record<string, unknown> | undefined)?.[FRAME_OPAQUE_KEY] as readonly [number, number] | undefined;
  return v !== undefined && v[1] > v[0] ? v : undefined;
}
