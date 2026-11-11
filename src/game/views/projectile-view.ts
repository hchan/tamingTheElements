import type Phaser from 'phaser';
import type { RenderProjectile } from '@core/index';
import manifest from '../assets/manifest.generated.json';
import { lerp } from './character-view';

interface Entry {
  readonly coords: readonly number[];
}
const SPRITES = manifest.sprites as Readonly<Record<string, Entry>>;
const MAP_SPRITES = manifest.mapSprites as Readonly<Record<string, Entry>>;

/** Legacy Tornado is created with `shouldNotRotateBullet`; every other bullet rotates to its direction. */
const FRAME = 'proj';
/** Phaser.BlendModes.ADD (a type-only Phaser import keeps this module unit-testable without the engine). */
const BLEND_ADD = 1;

/**
 * Legacy `createBullet` rotation (clockwise degrees): east 0, south-east 45, south 90, ..., north 270, north-east 315.
 * Dir8 indices run counter-clockwise on screen (DIR8_X/Y: 1 north-east, 2 north), so the angle is (8 - dir) * 45.
 */
export function rotationForDir(dir: number, sprite: string): number {
  return sprite === 'tornado' ? 0 : ((8 - dir) & 7) * 45;
}

/** How a melee box shows its sprite: east/west boxes stay flat (mirrored facing west), tall north/south boxes turn the sprite 90 degrees. */
export function meleeLook(dir: number, w: number, h: number): { angle: number; w: number; h: number; flip: boolean } {
  if ((dir === 2 || dir === 6) && h > w) return { angle: dir === 2 ? 270 : 90, w: h, h: w, flip: false };
  return { angle: 0, w, h, flip: dir >= 3 && dir <= 5 };
}

/** Texture key and manifest entry for an ability sprite (`sprite:` first, then `map:`). */
export function lookup(sprite: string): { key: string; entry: Entry } | undefined {
  const a = SPRITES[sprite];
  if (a) return { key: `sprite:${sprite}`, entry: a };
  const m = MAP_SPRITES[sprite];
  return m ? { key: `map:${sprite}`, entry: m } : undefined;
}

/** One pooled projectile sprite, drawn about its centre so rotation pivots like legacy `origin("center")`. */
export class ProjectileView {
  readonly image: Phaser.GameObjects.Image;
  /** Soft additive halo behind the sprite so small bolts and dashes have depth against bright arenas (the same frame, enlarged). */
  readonly glow: Phaser.GameObjects.Image;
  private key = '';

  constructor(private readonly scene: Phaser.Scene) {
    this.glow = scene.add.image(0, 0, '__DEFAULT').setOrigin(0.5, 0.5).setVisible(false).setBlendMode(BLEND_ADD).setAlpha(0.5);
    this.image = scene.add.image(0, 0, '__DEFAULT').setOrigin(0.5, 0.5).setVisible(false);
  }

  /** `melee`: a melee box (Ice Shock, Ground Shock, ...) drawn stretched over its hit box, mirrored west and turned for north/south. */
  apply(p: RenderProjectile, alpha: number, melee = false): void {
    if (p.sprite !== this.key) {
      this.key = p.sprite;
      const found = lookup(p.sprite);
      if (found) {
        const tex = this.scene.textures.get(found.key);
        const [fx = 0, fy = 0, fw = 80, fh = 80] = found.entry.coords;
        if (!tex.has(FRAME)) tex.add(FRAME, 0, fx, fy, fw, fh);
        this.image.setTexture(found.key, FRAME);
        this.glow.setTexture(found.key, FRAME);
      }
    }
    // The pose layer multiplies alpha after this runs (spawn ease-in); reset it every frame or pooled bolts dim for good.
    this.image.setVisible(true).setAlpha(1);
    const look = melee ? meleeLook(p.dir, p.w, p.h) : { angle: rotationForDir(p.dir, p.sprite), w: p.w, h: p.h, flip: false };
    this.image.setDisplaySize(look.w, look.h).setFlipX(look.flip);
    this.image.setPosition(lerp(p.px, p.x, alpha) + p.w / 2, lerp(p.py, p.y, alpha) + p.h / 2);
    this.image.setAngle(look.angle);
    // Thin bolts get a proportionally larger halo; both grow around the same centre; the pose layer turns the halo with the sprite.
    this.glow
      .setVisible(true)
      .setAlpha(0.5)
      .setDisplaySize(look.w * 1.6 + 6, look.h * 1.6 + 6)
      .setFlipX(look.flip)
      .setAngle(look.angle)
      .setPosition(this.image.x, this.image.y)
      .setDepth(this.image.depth - 0.01);
  }

  hide(): void {
    this.image.setVisible(false);
    this.glow.setVisible(false);
  }

  destroy(): void {
    this.glow.destroy();
    this.image.destroy();
  }
}
