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

/**
 * Multiplier a scene is rendering at, derived from the game height (720 times resolution). The height, not the width:
 * the wide view (`enableWideView`) makes the game wider than 1280 logical px, never taller than 720.
 */
export function resolutionOf(scene: Phaser.Scene): number {
  return scene.scale.height / LOGICAL_HEIGHT;
}

/** Visible logical width of the game: 1280, or more while the wide view is on. */
export function viewWidth(scene: Phaser.Scene): number {
  return scene.scale.width / resolutionOf(scene);
}

/**
 * CSS px width the central 1280x720 box is drawn at (the whole canvas without the wide view). Text boosts read this, so a
 * phone's HUD text grows by the same rule whether or not the wide view shows extra arena at the sides.
 */
export function coreDisplayWidth(scene: Phaser.Scene): number {
  return (scene.scale.displaySize.width * LOGICAL_WIDTH) / viewWidth(scene);
}

/**
 * Logical width of the wide view for a `parentW` x `parentH` CSS box: the box's aspect at 720 logical px high, never narrower
 * than 1280 (16:9 and taller screens keep the plain fit) nor wider than `max` (the world, so no void shows past its walls).
 * Even, so a 1.5 resolution still gives a whole-pixel canvas. Pure, for tests.
 */
export function wideViewWidth(parentW: number, parentH: number, max: number): number {
  if (!(parentW > 0 && parentH > 0)) return LOGICAL_WIDTH;
  const w = 2 * Math.floor((LOGICAL_HEIGHT * parentW) / parentH / 2);
  return Math.max(LOGICAL_WIDTH, Math.min(Math.max(LOGICAL_WIDTH, max), w));
}

/**
 * Widens the game to the parent box's aspect (up to `max` logical px) so a wide phone shows more arena instead of side
 * bars (QA r19). View only: the height stays 720 logical px, so every 1280x720 layout keeps its size and sits in the centre
 * of the wider canvas (`fitScene` re-centres the cameras). Follows window resizes and rotation until the scene shuts down.
 */
export function enableWideView(scene: Phaser.Scene, max: number): void {
  const scale = scene.scale;
  const fit = (): void => {
    const res = resolutionOf(scene);
    const w = Math.round(wideViewWidth(scale.parentSize.width, scale.parentSize.height, max) * res);
    if (w !== scale.width) scale.setGameSize(w, scale.height);
  };
  scale.on('resize', fit);
  const off = (): void => {
    scale.off('resize', fit);
  };
  scene.events.once('shutdown', off);
  scene.events.once('destroy', off);
  fit();
}

/**
 * Makes a scene lay out in logical 1280x720 units on a larger backing store: the main camera zooms by the
 * resolution and is centred on the logical arena, so world and pointer coordinates stay logical. It re-centres when the
 * game is resized (the wide view), so the 1280x720 layout stays in the middle.
 */
export function fitScene(scene: Phaser.Scene): void {
  const fit = (): void => {
    scene.cameras.main.setZoom(resolutionOf(scene)).centerOn(LOGICAL_WIDTH / 2, LOGICAL_HEIGHT / 2);
  };
  fit();
  scene.scale.on('resize', fit);
  const off = (): void => {
    scene.scale.off('resize', fit);
  };
  scene.events.once('shutdown', off);
  scene.events.once('destroy', off);
}

/** Text style rendered at the scene's resolution so glyphs stay sharp on high-DPI screens. */
export function crisp(scene: Phaser.Scene, style: Phaser.Types.GameObjects.Text.TextStyle): Phaser.Types.GameObjects.Text.TextStyle {
  return { ...style, resolution: resolutionOf(scene) };
}

/**
 * Text multiplier for small screens (`base` CSS px of box width, 900 by default; 1100 for the slim HUD): 1 from about 900 CSS px of canvas width up, growing (to `max`) as the canvas shrinks,
 * so HUD labels stay near 12 CSS px on a phone where the 1280 logical width is drawn about 0.3x.
 */
export function phoneBoost(scene: Phaser.Scene, max = 2.4, base = 900): number {
  const w = coreDisplayWidth(scene);
  return w > 0 ? Math.min(max, Math.max(1, base / w)) : 1;
}
