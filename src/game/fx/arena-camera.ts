/**
 * Pan/zoom framing for the wide Arcade arena (view only; WP 38a). Pure: no Phaser, no sim state, never feeds
 * back into the sim. Floats and Math.exp are fine here (the src/core determinism rules do not apply to view code).
 */

/** Keep each fighter at least this far (world px) inside the visible edge. */
export const CAMERA_MARGIN = 160;
/** Widest view allowed: 1280 / 1600. */
export const CAMERA_ZOOM_MIN = 0.8;
/** Ease rate per second: 1 - exp(-rate * dt) equals about 0.15 per frame at 60 fps. */
export const CAMERA_EASE_RATE = 9.75;

export interface CameraFraming {
  /** World x the camera looks at. */
  readonly centerX: number;
  /** 1 = exactly viewWidth world px visible; below 1 shows more. */
  readonly zoom: number;
}

export interface CameraInput {
  /** Centre x of the two live fighters (active fighter of each team in tag). */
  readonly x1: number;
  readonly x2: number;
  readonly worldWidth: number;
  /** Logical viewport width at zoom 1 (1280). */
  readonly viewWidth: number;
  /** Reduced motion: no smoothing, no zoom change (zoom fixed at 1, pan snaps). */
  readonly reducedMotion?: boolean;
}

/** Keep the view inside [0, worldWidth]; a view wider than the world centres on it. */
export function clampCenter(centerX: number, zoom: number, worldWidth: number, viewWidth: number): number {
  const half = viewWidth / zoom / 2;
  if (half * 2 >= worldWidth) return worldWidth / 2;
  return Math.min(worldWidth - half, Math.max(half, centerX));
}

/** The framing the camera wants this instant (no smoothing). */
export function idealFraming(i: CameraInput): CameraFraming {
  const zoom = i.reducedMotion
    ? 1
    : Math.min(1, Math.max(CAMERA_ZOOM_MIN, i.viewWidth / (Math.abs(i.x1 - i.x2) + 2 * CAMERA_MARGIN)));
  return { centerX: clampCenter((i.x1 + i.x2) / 2, zoom, i.worldWidth, i.viewWidth), zoom };
}

/**
 * Next framing. `prev` undefined, `snap` (round reset) or reduced motion returns the ideal framing directly;
 * otherwise centre and zoom ease exponentially (frame-rate independent in `dtSeconds`). The eased centre is
 * re-clamped at the eased zoom so a wall is never left uncovered mid-ease.
 */
export function cameraTarget(i: CameraInput, prev: CameraFraming | undefined, dtSeconds: number, snap = false): CameraFraming {
  const ideal = idealFraming(i);
  if (!prev || snap || i.reducedMotion) return ideal;
  const a = 1 - Math.exp(-CAMERA_EASE_RATE * Math.max(0, dtSeconds));
  const zoom = prev.zoom + (ideal.zoom - prev.zoom) * a;
  const centerX = clampCenter(prev.centerX + (ideal.centerX - prev.centerX) * a, zoom, i.worldWidth, i.viewWidth);
  return { centerX, zoom };
}
