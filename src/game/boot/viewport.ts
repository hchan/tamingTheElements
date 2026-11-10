import type Phaser from 'phaser';

/** Logical arena size. The simulation and every scene lay out in these units, whatever the window or DPR. */
export const LOGICAL_WIDTH = 1280;
export const LOGICAL_HEIGHT = 720;

/**
 * Highest backing-store multiplier. 2 covers retina and most 4K laptops; 3 would cost 2.25x more pixels
 * (3840x2160) for a gain few eyes can see, and software or mobile GPUs struggle with it.
 */
export const MAX_RESOLUTION = 2;

/** Integer render multiplier for a device pixel ratio: ceil so fractional ratios (1.25, 1.5) stay sharp. */
export function pickResolution(dpr: number): number {
  if (!Number.isFinite(dpr) || dpr <= 1) return 1;
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
