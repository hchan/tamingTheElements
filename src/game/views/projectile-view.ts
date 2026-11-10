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
const NO_ROTATE = new Set(['tornado']);
const FRAME = 'proj';

/** Legacy `createBullet` rotation: east 0, south 90, west 180, north 270, diagonals in between. */
export function rotationForDir(dir: number, sprite: string): number {
  return NO_ROTATE.has(sprite) ? 0 : (((dir % 8) + 8) % 8) * 45;
}

/** Texture key and manifest entry for an ability sprite (`sprite:` first, then `map:`). */
function lookup(sprite: string): { key: string; entry: Entry } | undefined {
  const a = SPRITES[sprite];
  if (a) return { key: `sprite:${sprite}`, entry: a };
  const m = MAP_SPRITES[sprite];
  return m ? { key: `map:${sprite}`, entry: m } : undefined;
}

/** One pooled projectile sprite, drawn about its centre so rotation pivots like legacy `origin("center")`. */
export class ProjectileView {
  readonly image: Phaser.GameObjects.Image;
  private key = '';

  constructor(private readonly scene: Phaser.Scene) {
    this.image = scene.add.image(0, 0, '__DEFAULT').setOrigin(0.5, 0.5).setVisible(false);
  }

  apply(p: RenderProjectile, alpha: number): void {
    if (p.sprite !== this.key) {
      this.key = p.sprite;
      const found = lookup(p.sprite);
      if (found) {
        const tex = this.scene.textures.get(found.key);
        const [fx = 0, fy = 0, fw = 80, fh = 80] = found.entry.coords;
        if (!tex.has(FRAME)) tex.add(FRAME, 0, fx, fy, fw, fh);
        this.image.setTexture(found.key, FRAME);
      }
    }
    this.image.setVisible(true);
    this.image.setDisplaySize(p.w, p.h);
    this.image.setPosition(lerp(p.px, p.x, alpha) + p.w / 2, lerp(p.py, p.y, alpha) + p.h / 2);
    this.image.setAngle(rotationForDir(p.dir, p.sprite));
  }

  hide(): void {
    this.image.setVisible(false);
  }

  destroy(): void {
    this.image.destroy();
  }
}
