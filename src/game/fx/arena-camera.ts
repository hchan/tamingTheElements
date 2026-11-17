/**
 * Pan/zoom framing for the wide Arcade arena (view only; WP 38a). Pure: no Phaser, no sim state, never feeds
 * back into the sim. Floats and Math.exp are fine here (the src/core determinism rules do not apply to view code).
 */

/** Keep each fighter at least this far (world px) inside the visible edge. */
export const CAMERA_MARGIN = 160;
/** Widest view allowed: 1920 px (the whole Arcade world), so both fighters are always on screen (SF2/MvC: nobody leaves the picture). */
export const CAMERA_ZOOM_MIN = 1280 / 1920;
/** Ease rate per second: 1 - exp(-rate * dt) equals about 0.15 per frame at 60 fps. */
export const CAMERA_EASE_RATE = 12;

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
  /** Larger half-width (world px) of the two fighters' boxes; a giant (up to 4x = 160) keeps its whole body inside the margin. Default 40 (a 1x hero). */
  readonly reach?: number;
  /** Logical viewport width at zoom 1 (1280). */
  readonly viewWidth: number;
  /** Reduced motion: no smoothing, no zoom change (zoom fixed at 1, pan snaps). */
  readonly reducedMotion?: boolean;
  /** Highest zoom (default 1: never closer than viewWidth world px). Portrait play's tall view allows more, since it has spare height. */
  readonly zoomMax?: number;
  /** Keep each fighter this far inside the visible edge (default {@link CAMERA_MARGIN}; smaller in portrait, where the view is narrow). */
  readonly margin?: number;
}

/** Narrower margin of the portrait tall view (world px). */
export const CAMERA_MARGIN_PORTRAIT = 48;

/**
 * World y the camera looks at so world y 720 (the floor's bottom edge) lands on screen y `barTop` (logical px of the view `viewH`
 * high) at total zoom `zoom`. A 720-high view (landscape, normal) always looks at 360, whatever the zoom: today's framing.
 */
export function verticalFrame(viewH: number, barTop: number, zoom: number): number {
  if (!(viewH > 720) || !(zoom > 0)) return 360;
  return 720 - (barTop - viewH / 2) / zoom;
}

/**
 * Highest zoom of the portrait tall view: the spare height allows a closer camera, up to 2.1 (and 1 on a view no taller than 16:9).
 * About 1.5 on 360x640 (view 1514 high), 2.05 on 390x844 (view 2066 high). QA r98: closer fights fill the tall view, less dead sky.
 */
export function portraitZoomMax(viewH: number): number {
  return Math.min(2.1, Math.max(1, viewH / 1008));
}

/** Keep the view inside [0, worldWidth]; a view wider than the world centres on it. */
export function clampCenter(centerX: number, zoom: number, worldWidth: number, viewWidth: number): number {
  const half = viewWidth / zoom / 2;
  if (half * 2 >= worldWidth) return worldWidth / 2;
  return Math.min(worldWidth - half, Math.max(half, centerX));
}

/** The framing the camera wants this instant (no smoothing). */
export function idealFraming(i: CameraInput): CameraFraming {
  // Never zoom out past the world itself (a 1280 world stays at zoom 1: the picture is identical to the fixed camera).
  const floor = Math.min(1, Math.max(CAMERA_ZOOM_MIN, i.viewWidth / i.worldWidth));
  const top = Math.max(1, i.zoomMax ?? 1);
  const zoom = i.reducedMotion ? 1 : Math.min(top, Math.max(floor, i.viewWidth / (Math.abs(i.x1 - i.x2) + 2 * ((i.margin ?? CAMERA_MARGIN) + Math.max(0, (i.reach ?? 40) - 40)))));
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

/**
 * The screen x to zoom about so a caster's drawn box `[lo, hi]` (screen px) stays inside `[mLo, span - mHi]` after zooming by
 * `z` (WP-HC1). Zooming about A maps x to A + (x - A) z, so the box fits while (hi z - span + mHi)/(z - 1) <= A <= (lo z - mLo)/(z - 1).
 * The box centre is clamped into that range, then into [0, span]; an empty range (a box wider than the screen) or no zoom
 * falls back to the centre.
 */
export function punchAnchor(lo: number, hi: number, z: number, span: number, mLo: number, mHi: number): number {
  const centre = (lo + hi) / 2;
  if (!(z > 1)) return centre;
  const min = (hi * z - span + mHi) / (z - 1);
  const max = (lo * z - mLo) / (z - 1);
  if (min > max) return centre;
  return Math.min(span, Math.max(0, Math.min(max, Math.max(min, centre))));
}
