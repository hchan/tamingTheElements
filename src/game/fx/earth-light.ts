import type Phaser from 'phaser';
import { arcadePlayfield } from '@core/index';
import { WALL_Y } from './terrain-stage-layout';

/**
 * Earth stage light (QA r24: earth read murky and olive, fighters dark silhouettes). View only, earth stage only: a faint warm
 * additive wash that lifts the floor's midtones and soft golden light shafts that slant down across it and breathe slowly.
 * Everything is additive and sits under the fighters (depth `EARTH_LIGHT_DEPTH`), so characters get a bright ground to read
 * against instead of a darker one. Reduced motion: the shafts hold still at a fixed strength. High contrast: nothing is drawn.
 * Two generated textures (made once per game), a fixed pool of images, nothing allocated per frame.
 */
export const EARTH_LIGHT_DEPTH = -0.6;
/** Warm gold of the wash and shafts. */
export const EARTH_GOLD = 0xffd98a;
/** Shaft count across the arena and the peak alpha of each (kept low: a glow, never a fog). */
export const SHAFTS = 7;
export const SHAFT_ALPHA = 0.42;
export const WASH_ALPHA = 0.13;
/** Slant of a shaft (radians from vertical). */
export const SHAFT_TILT = 0.42;
const SHAFT_W = 190;
const SHAFT_H = 560;
const WASH_KEY = 'earth-light:wash';
const SHAFT_KEY = 'earth-light:shaft';

/** Centre x (world px) of shaft `i`, spread over a playfield `w` px wide. Pure. */
export function shaftX(i: number, w: number): number {
  return Math.round(((i + 0.5) / SHAFTS) * w + (i % 2 === 0 ? -40 : 40));
}

/** Alpha of shaft `i` at view time `ms`: each breathes on its own slow period (triangle wave, no trig); fixed when `still`. Pure. */
export function shaftAlpha(i: number, ms: number, still: boolean): number {
  if (still) return SHAFT_ALPHA * 0.75;
  const period = 5200 + (i % 3) * 1700;
  const t = ((((ms + i * 977) % period) + period) % period) / period;
  const tri = t < 0.5 ? t * 2 : 2 - t * 2;
  return SHAFT_ALPHA * (0.45 + 0.55 * tri);
}

export interface EarthLight {
  /** Shows the light when `stage` is earth (3), faded by `alpha` (the stage swap fade); hidden otherwise or under high contrast. */
  update(stage: number, alpha: number, ms: number, still: boolean, highContrast: boolean): void;
  /** Shafts currently visible (test probe). */
  visible(): number;
  destroy(): void;
}

function ensureTextures(scene: Phaser.Scene): void {
  if (!scene.textures.exists(SHAFT_KEY)) {
    const tex = scene.textures.createCanvas(SHAFT_KEY, SHAFT_W, SHAFT_H);
    const ctx = tex?.getContext();
    if (tex && ctx) {
      // Soft across (bright core fading to nothing at both sides) and fading out toward the bottom.
      const across = ctx.createLinearGradient(0, 0, SHAFT_W, 0);
      across.addColorStop(0, 'rgba(255,255,255,0)');
      across.addColorStop(0.5, 'rgba(255,255,255,1)');
      across.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = across;
      ctx.fillRect(0, 0, SHAFT_W, SHAFT_H);
      ctx.globalCompositeOperation = 'destination-in';
      const down = ctx.createLinearGradient(0, 0, 0, SHAFT_H);
      down.addColorStop(0, 'rgba(0,0,0,0.25)');
      down.addColorStop(0.35, 'rgba(0,0,0,1)');
      down.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = down;
      ctx.fillRect(0, 0, SHAFT_W, SHAFT_H);
      tex.refresh();
    }
  }
  if (!scene.textures.exists(WASH_KEY)) {
    const tex = scene.textures.createCanvas(WASH_KEY, 4, 4);
    const ctx = tex?.getContext();
    if (tex && ctx) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 4, 4);
      tex.refresh();
    }
  }
}

export function mountEarthLight(scene: Phaser.Scene): EarthLight {
  const w = arcadePlayfield().w;
  let wash: Phaser.GameObjects.Image | undefined;
  let shafts: Phaser.GameObjects.Image[] = [];
  let shown = 0;
  const build = (): void => {
    ensureTextures(scene);
    wash = scene.add.image(0, WALL_Y, WASH_KEY).setOrigin(0, 0).setDisplaySize(w, 720 - WALL_Y).setTint(EARTH_GOLD).setBlendMode('ADD').setDepth(EARTH_LIGHT_DEPTH).setVisible(false);
    shafts = Array.from({ length: SHAFTS }, (_, i) =>
      scene.add.image(shaftX(i, w), WALL_Y - 20, SHAFT_KEY).setOrigin(0.5, 0).setRotation(SHAFT_TILT).setTint(EARTH_GOLD).setBlendMode('ADD').setDepth(EARTH_LIGHT_DEPTH + 0.01).setVisible(false));
  };
  return {
    update(stage, alpha, ms, still, highContrast): void {
      const on = stage === 3 && !highContrast;
      if (on && !wash) build();
      shown = 0;
      if (!wash) return;
      wash.setVisible(on).setAlpha(WASH_ALPHA * alpha);
      shafts.forEach((s, i) => {
        s.setVisible(on).setAlpha(shaftAlpha(i, ms, still) * alpha);
        if (on) shown++;
      });
    },
    visible: () => shown,
    destroy(): void {
      wash?.destroy();
      for (const s of shafts) s.destroy();
      wash = undefined;
      shafts = [];
    },
  };
}
