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

/** View-only: melee sprites drawn taller than their hit box (the art, not the box, is what the player must read). Ice Shock: 40 -> 72. */
const MELEE_ART_THICKNESS: Readonly<Record<string, number>> = { iceShock: 1.8 };

/** View-only: the shortest long side (px) a flying bolt is drawn at, so small hit boxes (fireball 25x12) still read. */
export const MIN_BOLT_LONG_SIDE = 44;
/**
 * View-only contrast boosts for the sprites the ability audit found weak (docs/ABILITY-AUDIT.md): a larger minimum long side, a
 * brighter and wider halo, and a halo tint that sets the art off from the arena floor. Hit boxes are untouched.
 */
export interface SpriteBoost { readonly minLong: number; readonly glowAlpha: number; readonly glowScale: number; readonly glowTint: number }
export const SPRITE_BOOST: Readonly<Record<string, SpriteBoost>> = {
  rockPellet: { minLong: 64, glowAlpha: 0.95, glowScale: 2.2, glowTint: 0xffd36b },
  stranglingBranches: { minLong: 0, glowAlpha: 0.7, glowScale: 1.5, glowTint: 0xc8ff7a },
  entanglingVines: { minLong: 0, glowAlpha: 0.75, glowScale: 1.3, glowTint: 0xe8c27a },
  crimsonFire: { minLong: 0, glowAlpha: 0.8, glowScale: 1.5, glowTint: 0xffe9a0 },
};

/** View-only: how much thicker than the length-matched scale a thin bolt may be drawn, to reach its box thickness. */
const MAX_THICKEN = 1.5;

/**
 * Display size of a flying bolt: the art keeps its aspect ratio (no squashing into the hit box), is at least as long as the box,
 * at least `MIN_BOLT_LONG_SIDE` on its long side, and thickened up to `MAX_THICKEN` toward the box thickness. Hit boxes are untouched.
 */
export function boltDisplaySize(boxW: number, boxH: number, artW: number, artH: number, minLong = MIN_BOLT_LONG_SIDE): { w: number; h: number } {
  if (artW <= 0 || artH <= 0) return { w: boxW, h: boxH };
  const lengthScale = Math.max(boxW / artW, minLong / Math.max(artW, artH));
  const scale = Math.max(lengthScale, Math.min(boxH / artH, lengthScale * MAX_THICKEN));
  return { w: artW * scale, h: artH * scale };
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
  private artW = 0;
  private artH = 0;

  constructor(private readonly scene: Phaser.Scene) {
    this.glow = scene.add.image(0, 0, '__DEFAULT').setOrigin(0.5, 0.5).setVisible(false).setBlendMode(BLEND_ADD).setAlpha(0.5);
    this.image = scene.add.image(0, 0, '__DEFAULT').setOrigin(0.5, 0.5).setVisible(false);
  }

  /** `melee`: a melee box (Ice Shock, Ground Shock, ...) drawn stretched over its hit box, mirrored west and turned for north/south. */
  apply(p: RenderProjectile, alpha: number, melee = false): void {
    if (p.sprite !== this.key) {
      this.key = p.sprite;
      this.artW = 0;
      this.artH = 0;
      const found = lookup(p.sprite);
      if (found) {
        const tex = this.scene.textures.get(found.key);
        const [fx = 0, fy = 0, fw = 80, fh = 80] = found.entry.coords;
        if (!tex.has(FRAME)) tex.add(FRAME, 0, fx, fy, fw, fh);
        this.artW = fw;
        this.artH = fh;
        this.image.setTexture(found.key, FRAME);
        this.glow.setTexture(found.key, FRAME);
      }
    }
    // The pose layer multiplies alpha after this runs (spawn ease-in); reset it every frame or pooled bolts dim for good.
    this.image.setVisible(true).setAlpha(1);
    const look = melee ? meleeLook(p.dir, p.w, p.h) : { angle: rotationForDir(p.dir, p.sprite), w: p.w, h: p.h, flip: false };
    const boost = SPRITE_BOOST[p.sprite];
    if (melee) look.h *= MELEE_ART_THICKNESS[p.sprite] ?? 1;
    else if (this.artW > 0) Object.assign(look, boltDisplaySize(p.w, p.h, this.artW, this.artH, Math.max(MIN_BOLT_LONG_SIDE, boost?.minLong ?? 0)));
    this.image.setDisplaySize(look.w, look.h).setFlipX(look.flip);
    // Melee boxes are placed once and never moved, so their previous position (px/py) is unset: do not lerp from it.
    const a = melee ? 1 : alpha;
    this.image.setPosition(lerp(p.px, p.x, a) + p.w / 2, lerp(p.py, p.y, a) + p.h / 2);
    this.image.setAngle(look.angle);
    // Thin bolts get a proportionally larger halo; both grow around the same centre; the pose layer turns the halo with the sprite.
    this.glow
      .setVisible(true)
      .setAlpha(boost?.glowAlpha ?? (melee ? 0.2 : 0.5))
      .setDisplaySize(look.w * (boost?.glowScale ?? (melee ? 1 : 1.6)) + 6, look.h * (boost?.glowScale ?? (melee ? 1 : 1.6)) + 6)
      .setTint(boost?.glowTint ?? 0xffffff)
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
