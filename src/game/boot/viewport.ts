import type Phaser from 'phaser';

/** Logical arena size. The simulation and every scene lay out in these units, whatever the window or DPR. */
export const LOGICAL_WIDTH = 1280;
export const LOGICAL_HEIGHT = 720;

/**
 * Highest backing-store multiplier. 2 covers retina and most 4K laptops; 3 would cost 2.25x more pixels
 * (3840x2160) for a gain few eyes can see, and software or mobile GPUs struggle with it.
 */
export const MAX_RESOLUTION = 2;

/** Default backing store: 1.5 x 1280x720 = 1920x1080 (owner, 2026-11-13), so standard 1x screens render at full HD instead of upscaling 720p. */
export const DEFAULT_RESOLUTION = 1.5;

/** Render multiplier for a device pixel ratio: never below 1920x1080; ceil above 1.5 so fractional ratios (1.75) stay sharp, capped at 2. */
export function pickResolution(dpr: number): number {
  if (!Number.isFinite(dpr) || dpr <= DEFAULT_RESOLUTION) return DEFAULT_RESOLUTION;
  return Math.min(MAX_RESOLUTION, Math.ceil(dpr));
}

/** Multiplier a scene is rendering at, derived from the game size (logical size times resolution). */
export function resolutionOf(scene: Phaser.Scene): number {
  return scene.scale.width / LOGICAL_WIDTH;
}

/**
 * Makes a scene lay out in logical 1280x720 units on a larger backing store: the main camera zooms by the
 * resolution and is centred on the logical arena, so world and pointer coordinates stay logical.
 */
export function fitScene(scene: Phaser.Scene): void {
  scene.cameras.main.setZoom(resolutionOf(scene)).centerOn(LOGICAL_WIDTH / 2, LOGICAL_HEIGHT / 2);
}

/** Text style rendered at the scene's resolution so glyphs stay sharp on high-DPI screens. */
export function crisp(scene: Phaser.Scene, style: Phaser.Types.GameObjects.Text.TextStyle): Phaser.Types.GameObjects.Text.TextStyle {
  return { ...style, resolution: resolutionOf(scene) };
}

/**
 * Text multiplier for small screens: 1 from about 900 CSS px of canvas width up, growing (to `max`) as the canvas shrinks,
 * so HUD labels stay near 12 CSS px on a phone where the 1280 logical width is drawn about 0.3x.
 */
export function phoneBoost(scene: Phaser.Scene, max = 2.4): number {
  const w = scene.scale.displaySize.width;
  return w > 0 ? Math.min(max, Math.max(1, 900 / w)) : 1;
}
