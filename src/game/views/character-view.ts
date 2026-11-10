import type Phaser from 'phaser';
import { EntityFlag, type RenderCharacter } from '@core/index';
import manifest from '../assets/manifest.generated.json';

export const FROZEN_TINT = 0x88ccff;
/** Render ticks per animation frame while moving (about 8 fps at 50 Hz). */
export const TICKS_PER_FRAME = 6;

type FrameSet = 'left' | 'right' | 'up' | 'down';
type Frames = readonly (readonly number[])[];
interface MapSprite {
  readonly coords: readonly number[];
  readonly leftFrames?: Frames;
  readonly rightFrames?: Frames;
  readonly upFrames?: Frames;
  readonly downFrames?: Frames;
}
const MAP_SPRITES = manifest.mapSprites as Readonly<Record<string, MapSprite>>;

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

/** Frame index for a looping reel; frozen at 0 while standing still (legacy `pauseAnimation`). */
export function frameIndex(tick: number, count: number, moving: boolean): number {
  if (!moving || count <= 0) return 0;
  return Math.floor(tick / TICKS_PER_FRAME) % count;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function framesOf(sprite: MapSprite, set: FrameSet): Frames {
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
function frameName(set: FrameSet, i: number): string {
  const names = FRAME_NAMES[set];
  return (names[i] ??= `${set}${String(i)}`);
}

/** One pooled character sprite; `apply` is the only thing that touches Phaser state each frame. */
export class CharacterView {
  readonly image: Phaser.GameObjects.Image;
  private spriteName = '';
  private sprite: MapSprite | undefined;
  /** True only while this view itself holds the frozen tint, so it never clears the hit flash (set by the fx sink). */
  private frozenTint = false;

  constructor(private readonly scene: Phaser.Scene) {
    this.image = scene.add.image(0, 0, '__DEFAULT').setOrigin(0, 0).setVisible(false);
  }

  apply(c: RenderCharacter, tick: number, alpha: number): void {
    const hidden = (c.flags & (EntityFlag.benched | EntityFlag.dead)) !== 0;
    this.image.setVisible(!hidden);
    if (hidden) return;
    if (c.sprite !== this.spriteName) {
      const key = `map:${c.sprite}`;
      this.spriteName = c.sprite;
      this.sprite = MAP_SPRITES[c.sprite];
      if (this.sprite) {
        this.image.setTexture(key);
        ensureFrames(this.scene, key, this.sprite);
      }
    }
    const x = lerp(c.px, c.x, alpha);
    const y = lerp(c.py, c.y, alpha);
    this.image.setPosition(x, y);
    this.image.setDisplaySize(c.w, c.h);
    if (this.sprite) {
      const set = frameSetFor(c.dir);
      const count = framesOf(this.sprite, set).length;
      const moving = c.x !== c.px || c.y !== c.py;
      this.image.setFrame(frameName(set, frameIndex(tick, count, moving)));
    }
    this.image.setFlipX(flipForDir(c.dir));
    this.image.setAlpha((c.flags & EntityFlag.translucent) !== 0 ? 0.5 : 1);
    if ((c.flags & EntityFlag.frozen) !== 0) {
      this.image.setTint(FROZEN_TINT);
      this.frozenTint = true;
    } else if (this.frozenTint) {
      this.image.clearTint();
      this.frozenTint = false;
    }
  }

  hide(): void {
    this.image.setVisible(false);
  }

  destroy(): void {
    this.image.destroy();
  }
}
