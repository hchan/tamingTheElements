import type Phaser from 'phaser';
import { EntityFlag, type Element, type RenderCharacter } from '@core/index';
import manifest from '../assets/manifest.generated.json';
import { gradedHeroTexture } from '../fx/hero-grade';
import { arcadeHeroScale } from './hero-scale';

/** Classic draws sprites this much larger than their hitbox, anchored at the feet centre (display only; the box is unchanged). */
export const CLASSIC_SPRITE_SCALE = 1.4;
export const FROZEN_TINT = 0x88ccff;
/**
 * Hit flash (FUN-DESIGN section 3, VISUAL-QA V6): a bright additive wash for 2 rendered frames, then the hit tint for 8 (red in
 * Classic, so a hit reads as an injury). Additive, not a solid fill: a fill paints every opaque or soft-edged texel pure white
 * and reads as a hard rectangle; adding light keeps the baked outline and shading, so the flash follows the silhouette.
 */
export const FLASH_FILL_FRAMES = 2;
/** The additive wash colour (added to each texel; alpha untouched). */
export const FLASH_WASH = 0x6e6e6e;
/** Presentation-only hit-stop: at most this many rendered frames the flash holds on a heavy hit (the sim is never paused). */
export const MAX_HOLD_FRAMES = 6;
export const FLASH_TINT_FRAMES = 8;
/** Hit-stop jitter amplitude in px. */
export const JITTER_PX = 2;
/** Phaser.TintModes values (a type-only Phaser import keeps this module loadable in Node tests). */
const TINT_MULTIPLY = 0;
const TINT_ADD = 2;

export type TintStage = 'wash' | 'hit' | 'frozen' | 'none';

/** Which tint a character shows this frame, given the flash frames left: the flash wins over the frozen tint. */
export function tintStage(flashLeft: number, frozen: boolean): TintStage {
  if (flashLeft > FLASH_TINT_FRAMES) return 'wash';
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

/** Pale air beings that vanish on the dark floors: they get a soft additive ground glow under the sprite (display only). */
export const GLOW_SPRITES: ReadonlySet<string> = new Set(['wispera', 'echo']);
const GLOW_KEY = 'hero-glow';
const GLOW_TINT = 0xb4d2ff;
const GLOW_ALPHA = 0.65;
const HALO_ALPHA = 0.4;

/** The shared soft radial glow texture (64x64, white to transparent); undefined where no canvas is available (Node tests). */
function glowTexture(scene: Phaser.Scene): string | undefined {
  try {
    if (scene.textures.exists(GLOW_KEY)) return GLOW_KEY;
    const t = scene.textures.createCanvas(GLOW_KEY, 64, 64);
    const ctx = t?.getContext();
    if (!t || !ctx) return undefined;
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,0.9)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    t.refresh();
    return GLOW_KEY;
  } catch {
    return undefined;
  }
}

/** One pooled character sprite; `apply` is the only thing that touches Phaser state each frame. */
export class CharacterView {
  readonly image: Phaser.GameObjects.Image;
  private glow: Phaser.GameObjects.Image | undefined;
  private halo: Phaser.GameObjects.Image | undefined;
  /** Soft elliptical ground shadow under the feet (Arcade, `fit`). */
  private shadow: Phaser.GameObjects.Image | undefined;
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
  /** Rendered frames the flash holds before it starts to age (view-only hit-stop on heavy hits). */
  private holdLeft = 0;
  private tinted = false;
  private jitterUntil = 0;
  private jitterSign = 1;

  /**
   * `scale` is the display scale over the sim box (feet-anchored). With `fit` (Arcade) it is chosen per body from its box
   * height (`arcadeHeroScale`) so a giant does not fill the screen, and the hero gets a ground shadow.
   */
  constructor(private readonly scene: Phaser.Scene, public scale = 1, private readonly fit = false) {
    this.image = scene.add.image(0, 0, '__DEFAULT').setOrigin(0, 0).setVisible(false);
  }

  /** Starts the hit flash: additive wash, then `tint`; `holdFrames` (heavy hits) freezes it on the wash for a few frames. */
  flash(tint: number, holdFrames = 0): void {
    this.flashLeft = FLASH_FILL_FRAMES + FLASH_TINT_FRAMES;
    this.flashTint = tint;
    this.holdLeft = Math.min(MAX_HOLD_FRAMES, Math.max(0, Math.floor(holdFrames)));
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
      this.glow?.setVisible(false);
      this.halo?.setVisible(false);
      this.shadow?.setVisible(false);
      this.flashLeft = 0;
      this.holdLeft = 0;
      return;
    }
    if (c.sprite !== this.spriteName) {
      const key = `map:${c.sprite}`;
      this.spriteName = c.sprite;
      this.sprite = MAP_SPRITES[c.sprite];
      if (this.sprite) {
        ensureFrames(this.scene, key, this.sprite);
        // The standing frame; the pose layer (views/pose-layer.ts) picks the facing (mirror) and walk frame once loaded.
        this.image.setTexture(gradedHeroTexture(this.scene, key), frameName('right', 0));
      }
    }
    let x = lerp(c.px, c.x, alpha);
    let y = lerp(c.py, c.y, alpha);
    if (tick < this.jitterUntil) {
      if (live) this.jitterSign = -this.jitterSign;
      x += JITTER_PX * this.jitterSign;
      y -= JITTER_PX * this.jitterSign;
    }
    if (this.fit) this.scale = arcadeHeroScale(c.h);
    const k = this.scale;
    this.image.setPosition(x - (c.w * (k - 1)) / 2, y - c.h * (k - 1));
    this.image.setDisplaySize(c.w * k, c.h * k);
    this.image.setAlpha((c.flags & EntityFlag.translucent) !== 0 ? 0.5 : 1);
    this.placeGlow(c.sprite, x, y, c.w * k, c.h * k);
    this.placeShadow(x + c.w / 2, y + c.h, c.w, k, (c.flags & EntityFlag.translucent) !== 0);
    const stage = tintStage(this.flashLeft, (c.flags & EntityFlag.frozen) !== 0);
    if (live && this.flashLeft > 0) {
      if (this.holdLeft > 0) this.holdLeft--;
      else this.flashLeft--;
    }
    if (stage === 'none') {
      if (this.tinted) this.image.clearTint();
      this.tinted = false;
      return;
    }
    this.tinted = true;
    this.image
      .setTint(stage === 'wash' ? FLASH_WASH : stage === 'hit' ? this.flashTint : FROZEN_TINT)
      .setTintMode(stage === 'wash' ? TINT_ADD : TINT_MULTIPLY);
  }

  /** A soft ellipse of pale light under the feet for `GLOW_SPRITES`, so they read on dark floors. */
  private placeGlow(sprite: string, x: number, y: number, w: number, h: number): void {
    if (!GLOW_SPRITES.has(sprite)) {
      this.glow?.setVisible(false);
      this.halo?.setVisible(false);
      return;
    }
    if (!this.glow) {
      const key = glowTexture(this.scene);
      if (!key) return;
      this.glow = this.scene.add.image(0, 0, key).setTint(GLOW_TINT).setAlpha(GLOW_ALPHA).setBlendMode(1);
    }
    this.glow.setVisible(true).setDepth(this.image.depth - 0.5);
    this.glow.setPosition(x + w / 2, y + h * 0.66).setDisplaySize(w * 1.15, h * 0.62);
    // A pale rim of light around the body (a soft halo just behind the sprite) so a dark or translucent hero keeps its outline on a dark floor.
    this.halo ??= this.scene.add.image(0, 0, this.glow.texture.key).setTint(GLOW_TINT).setAlpha(HALO_ALPHA).setBlendMode(1);
    this.halo.setVisible(true).setDepth(this.image.depth - 0.4);
    this.halo.setPosition(x + w / 2, y + h * 0.5).setDisplaySize(w * 1.5, h * 1.35);
  }

  /**
   * A soft dark ellipse on the floor under the feet (fx-scale only; the sim box is unchanged). Sits just under the sprite in
   * depth so it never covers a hero, and keeps its size while the hero bobs or squashes.
   */
  private placeShadow(cx: number, feetY: number, w: number, k: number, ghost: boolean): void {
    if (!this.fit) return;
    if (!this.shadow) {
      const key = glowTexture(this.scene);
      if (!key) return;
      this.shadow = this.scene.add.image(0, 0, key).setTint(0x000000);
    }
    const sw = w * k * 0.95;
    this.shadow
      .setVisible(true)
      .setDepth(this.image.depth - 0.6)
      .setAlpha(ghost ? 0.25 : 0.55)
      .setPosition(cx, feetY - 2)
      .setDisplaySize(sw, sw * 0.26);
  }

  hide(): void {
    this.glow?.setVisible(false);
    this.halo?.setVisible(false);
    this.shadow?.setVisible(false);
    this.image.setVisible(false);
    this.flashLeft = 0;
    this.holdLeft = 0;
    this.jitterUntil = 0;
  }

  destroy(): void {
    this.glow?.destroy();
    this.halo?.destroy();
    this.shadow?.destroy();
    this.image.destroy();
  }
}
