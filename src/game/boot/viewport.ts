import type Phaser from 'phaser';
import { PORTRAIT_PLAY as PORTRAIT_PLAY_KEY, PORTRAIT_TOP_STRIP, isPortraitPlay, measureDeck } from './portrait-play';

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
 * Multiplier a scene is rendering at: the smaller of width/1280 and height/720 of the game size. Normally (and in the wide
 * view, which only widens) that is height/720; the tall view (`enableWideView` in portrait play) is 1280 wide and taller than
 * 720 logical px, so the width rules. Equal in a plain 1280x720 game.
 */
export function resolutionOf(scene: Phaser.Scene): number {
  return Math.min(scene.scale.width / LOGICAL_WIDTH, scene.scale.height / LOGICAL_HEIGHT);
}

/** Visible logical height of the game: 720, or more while the tall view (portrait play) is on. */
export function viewHeight(scene: Phaser.Scene): number {
  return scene.scale.height / resolutionOf(scene);
}

/** Tallest tall view (logical px): keeps a very narrow, very tall window from asking for an absurd canvas. */
export const MAX_TALL_HEIGHT = 2400;

/**
 * Logical height of the tall view for a `parentW` x `parentH` CSS box with `strip` px above the canvas and `deck` px below:
 * the canvas is 1280 logical px wide, drawn at parentW, and fills what is left (`parentH - strip - deck`). Even, clamped to
 * 720..2400; 720 means "no tall view" (the box is not taller than 16:9, so the normal layout stays). Pure, for tests.
 */
export function tallViewHeight(parentW: number, parentH: number, strip: number, deck: number): number {
  if (!(parentW > 0 && parentH > 0)) return LOGICAL_HEIGHT;
  const avail = parentH - strip - deck;
  const h = (LOGICAL_WIDTH * avail) / parentW;
  if (!(h >= LOGICAL_HEIGHT)) return LOGICAL_HEIGHT;
  return Math.min(MAX_TALL_HEIGHT, 2 * Math.floor(h / 2));
}

/**
 * Render multiplier for a tall view of `height` logical px: res*sqrt(720/height), so the backing store keeps (at most) the
 * pixel count of the normal 1280x720*res one (never above 2560x1440), but never under 1 (a phone's canvas is only about 400 CSS px wide anyway).
 */
export function tallResolution(res: number, height: number): number {
  return Math.max(1, res * Math.sqrt(LOGICAL_HEIGHT / Math.max(LOGICAL_HEIGHT, height)));
}

/** Backing-store size (whole pixels) of the tall view of `height` logical px at base resolution `res`. */
export function tallGameSize(res: number, height: number): { w: number; h: number } {
  const r = tallResolution(res, height);
  return { w: Math.floor(LOGICAL_WIDTH * r), h: Math.floor(height * r) };
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

/** The base (16:9) game size the config asked for, in backing-store px, with the multiplier it implies. */
function baseSize(scene: Phaser.Scene): { w: number; h: number; res: number } {
  const cfg = (scene.game as Phaser.Game | undefined)?.config;
  const w = Number(cfg?.width);
  const h = Number(cfg?.height);
  if (w > 0 && h > 0) return { w, h, res: w / LOGICAL_WIDTH };
  const res = resolutionOf(scene);
  return { w: Math.round(LOGICAL_WIDTH * res), h: Math.round(LOGICAL_HEIGHT * res), res };
}

/**
 * Widens the game to the parent box's aspect (up to `max` logical px) so a wide phone shows more arena instead of side
 * bars (QA r19). View only: the height stays 720 logical px, so every 1280x720 layout keeps its size and sits in the centre
 * of the wider canvas (`fitScene` re-centres the cameras). Follows window resizes and rotation until the scene shuts down.
 *
 * In portrait play (`html[data-portrait-play]`) it instead makes the game TALL: 1280 logical px wide and as high as the box
 * allows between the 52 px top strip and the control deck (`tallViewHeight`), at a lower multiplier (`tallResolution`) that keeps the pixel
 * budget. Leaving portrait play restores the 16:9 base size. This is the only code that sets the game size.
 */
export function enableWideView(scene: Phaser.Scene, max: number): () => void {
  const scale = scene.scale;
  const fit = (): void => {
    const base = baseSize(scene);
    let w = Math.round(wideViewWidth(scale.parentSize.width, scale.parentSize.height, max) * base.res);
    let h = base.h;
    if (isPortraitPlay(scene.game)) {
      const tall = tallViewHeight(scale.parentSize.width, scale.parentSize.height, PORTRAIT_TOP_STRIP, measureDeck(scene.game));
      if (tall > LOGICAL_HEIGHT) {
        const size = tallGameSize(base.res, tall);
        w = size.w;
        h = size.h;
      }
    }
    if (w !== scale.width || h !== scale.height) scale.setGameSize(w, h);
  };
  scale.on('resize', fit);
  scene.game.registry.events.on(`changedata-${PORTRAIT_PLAY_KEY}`, fit);
  const off = (): void => {
    scale.off('resize', fit);
    scene.game.registry.events.off(`changedata-${PORTRAIT_PLAY_KEY}`, fit);
  };
  scene.events.once('shutdown', () => {
    off();
    // Menus and cut-scenes are 16:9: give back the base size when the tall view was on (a wide view stays, as before).
    const base = baseSize(scene);
    if (scale.height !== base.h) scale.setGameSize(base.w, base.h);
  });
  scene.events.once('destroy', off);
  fit();
  return off;
}

/**
 * Makes a scene lay out in logical 1280x720 units on a larger backing store: the main camera zooms by the
 * resolution and is centred on the logical arena, so world and pointer coordinates stay logical. It re-centres when the
 * game is resized (the wide view), so the 1280x720 layout stays in the middle.
 */
export function fitScene(scene: Phaser.Scene, anchor: 'top' | 'middle' = 'middle'): void {
  const fit = (): void => {
    // 'top' keeps the 1280x720 layout at the top of a tall view (the Hud scene: its bar is bottom-anchored by the screen-box maths).
    scene.cameras.main.setZoom(resolutionOf(scene)).centerOn(LOGICAL_WIDTH / 2, anchor === 'top' ? viewHeight(scene) / 2 : LOGICAL_HEIGHT / 2);
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
