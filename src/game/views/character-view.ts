import type Phaser from 'phaser';
import { EntityFlag, type Element, type RenderCharacter } from '@core/index';
import manifest from '../assets/manifest.generated.json';

export const FROZEN_TINT = 0x88ccff;
/** Hit flash (FUN-DESIGN section 3, VISUAL-QA V6): white fill for 2 rendered frames, then the hit tint for 4. */
export const FLASH_FILL_FRAMES = 2;
export const FLASH_TINT_FRAMES = 4;
/** Hit-stop jitter amplitude in px. */
export const JITTER_PX = 2;
/** Phaser.TintModes values (a type-only Phaser import keeps this module loadable in Node tests). */
const TINT_MULTIPLY = 0;
const TINT_FILL = 1;

export type TintStage = 'fill' | 'hit' | 'frozen' | 'none';

/** Which tint a character shows this frame, given the flash frames left: the flash wins over the frozen tint. */
export function tintStage(flashLeft: number, frozen: boolean): TintStage {
  if (flashLeft > FLASH_TINT_FRAMES) return 'fill';
  if (flashLeft > 0) return 'hit';
  return frozen ? 'frozen' : 'none';
}
export type FrameSet = 'left' | 'right' | 'up' | 'down';
type Frames = readonly (readonly number[])[];
export interface MapSprite {
  readonly coords: readonly number[];
  readonly leftFrames?: Frames;
  readonly rightFrames?: Frames;
  readonly upFrames?: Frames;
  readonly downFrames?: Frames;
}
export const MAP_SPRITES = manifest.mapSprites as Readonly<Record<string, MapSprite>>;

/** Legacy `doAnimation`: north/south use the Up/Down reels, everything else the side reel. */
export function frameSetFor(dir: number): FrameSet {
  if (dir === 6) return 'up';
  if (dir === 2) return 'down';
  return dir >= 3 && dir <= 5 ? 'left' : 'right';
}

/** Legacy `flipIfNecessary`, driven by facing: west-ish directions mirror the sprite. */
export function flipForDir(dir: number): boolean {
  return dir >= 3 && dir <= 5;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function framesOf(sprite: MapSprite, set: FrameSet): Frames {
  const own = set === 'left' ? sprite.leftFrames : set === 'up' ? sprite.upFrames : set === 'down' ? sprite.downFrames : sprite.rightFrames;
  return own && own.length > 0 ? own : (sprite.rightFrames ?? []);
}

/** Registers the manifest's frame rectangles on the loaded `map:<sprite>` texture (idempotent). */
function ensureFrames(scene: Phaser.Scene, key: string, sprite: MapSprite): void {
  const tex = scene.textures.get(key);
  const [, , w = 80, h = 80] = sprite.coords;
  for (const set of ['left', 'right', 'up', 'down'] as const) {
    framesOf(sprite, set).forEach(([fx = 0, fy = 0], i) => {
      const name = `${set}${String(i)}`;
      if (!tex.has(name)) tex.add(name, 0, fx, fy, w, h);
    });
  }
}

const FRAME_NAMES: Record<FrameSet, string[]> = { left: [], right: [], up: [], down: [] };
/** Frame name like `left3`, built once per (set, index) so the per-frame path allocates no strings. */
export function frameName(set: FrameSet, i: number): string {
  const names = FRAME_NAMES[set];
  return (names[i] ??= `${set}${String(i)}`);
}

/** One pooled character sprite; `apply` is the only thing that touches Phaser state each frame. */
export class CharacterView {
  readonly image: Phaser.GameObjects.Image;
  private spriteName = '';
  private sprite: MapSprite | undefined;
  /** Element of the character shown (hit colour of its attacks). */
  element: Element = 'void';
  /**
   * The view is the only owner of the tint: the flash counts rendered frames here instead of a wall-clock timer, so
   * it cannot expire between two renders, the frozen tint cannot overwrite it, and it holds while the sim is paused.
   */
  private flashLeft = 0;
  private flashTint = 0xffffff;
  private tinted = false;
  private jitterUntil = 0;
  private jitterSign = 1;

  constructor(private readonly scene: Phaser.Scene) {
    this.image = scene.add.image(0, 0, '__DEFAULT').setOrigin(0, 0).setVisible(false);
  }

  /** Starts the hit flash: white fill, then `tint`. */
  flash(tint: number): void {
    this.flashLeft = FLASH_FILL_FRAMES + FLASH_TINT_FRAMES;
    this.flashTint = tint;
  }

  /** Hit-stop jitter while the view tick is below `untilTick`. */
  jitter(untilTick: number): void {
    this.jitterUntil = untilTick;
  }

  /** `live` is false while the sim is paused: the flash and jitter then hold their frame. */
  apply(c: RenderCharacter, tick: number, alpha: number, live = true): void {
    this.element = c.element;
    const hidden = (c.flags & (EntityFlag.benched | EntityFlag.dead)) !== 0;
    this.image.setVisible(!hidden);
    if (hidden) {
      this.flashLeft = 0;
      return;
    }
    if (c.sprite !== this.spriteName) {
      const key = `map:${c.sprite}`;
      this.spriteName = c.sprite;
      this.sprite = MAP_SPRITES[c.sprite];
      if (this.sprite) {
        ensureFrames(this.scene, key, this.sprite);
        // The standing frame; the pose layer (views/pose-layer.ts) picks the facing (mirror) and walk frame once loaded.
        this.image.setTexture(key, frameName('right', 0));
      }
    }
    let x = lerp(c.px, c.x, alpha);
    let y = lerp(c.py, c.y, alpha);
    if (tick < this.jitterUntil) {
      if (live) this.jitterSign = -this.jitterSign;
      x += JITTER_PX * this.jitterSign;
      y -= JITTER_PX * this.jitterSign;
    }
    this.image.setPosition(x, y);
    this.image.setDisplaySize(c.w, c.h);
    this.image.setAlpha((c.flags & EntityFlag.translucent) !== 0 ? 0.5 : 1);
    const stage = tintStage(this.flashLeft, (c.flags & EntityFlag.frozen) !== 0);
    if (live && this.flashLeft > 0) this.flashLeft--;
    if (stage === 'none') {
      if (this.tinted) this.image.clearTint();
      this.tinted = false;
      return;
    }
    this.tinted = true;
    this.image
      .setTint(stage === 'fill' ? 0xffffff : stage === 'hit' ? this.flashTint : FROZEN_TINT)
      .setTintMode(stage === 'fill' ? TINT_FILL : TINT_MULTIPLY);
  }

  hide(): void {
    this.image.setVisible(false);
    this.flashLeft = 0;
    this.jitterUntil = 0;
  }

  destroy(): void {
    this.image.destroy();
  }
}
