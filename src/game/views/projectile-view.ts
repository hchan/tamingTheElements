import type Phaser from 'phaser';
import type { RenderProjectile } from '@core/index';
import manifest from '../assets/manifest.generated.json';
import { lerp } from './character-view';
import { SMOOTH_KIND, hurricaneSpin, meleeFadeOut, meleeGrowIn, pulseBump } from '../fx/ability-smooth';

interface Entry {
  readonly coords: readonly number[];
}
const SPRITES = manifest.sprites as Readonly<Record<string, Entry>>;
const MAP_SPRITES = manifest.mapSprites as Readonly<Record<string, Entry>>;

/** Legacy Tornado is created with `shouldNotRotateBullet`; every other bullet rotates to its direction. */
const FRAME = 'proj';
/** Phaser.BlendModes.ADD (a type-only Phaser import keeps this module unit-testable without the engine). */
const BLEND_ADD = 1;
/** Phaser.BlendModes.NORMAL. */
const BLEND_NORMAL = 0;

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
const MELEE_ART_THICKNESS: Readonly<Record<string, number>> = { iceShock: 1.8, stranglingBranches: 1.7 };

/** View-only: the shortest long side (px) a flying bolt is drawn at, so small hit boxes (fireball 25x12) still read. */
export const MIN_BOLT_LONG_SIDE = 44;
/**
 * View-only contrast boosts for the sprites the ability audit found weak (docs/ABILITY-AUDIT.md): a larger minimum long side, a
 * brighter and wider halo, and a halo tint that sets the art off from the arena floor. Hit boxes are untouched.
 */
export interface SpriteBoost { readonly minLong: number; readonly glowAlpha: number; readonly glowScale: number; readonly glowTint: number;
  /** Draw the halo as a dark normal-blend outline instead of an additive glow (pale sprites on bright floors, e.g. the Stick dart on the fire floor). */
  readonly dark?: boolean }
export const SPRITE_BOOST: Readonly<Record<string, SpriteBoost>> = {
  rockPellet: { minLong: 64, glowAlpha: 0.95, glowScale: 2.2, glowTint: 0xffd36b },
  stranglingBranches: { minLong: 0, glowAlpha: 0.95, glowScale: 1.7, glowTint: 0xd4ff6a },
  entanglingVines: { minLong: 0, glowAlpha: 0.75, glowScale: 1.3, glowTint: 0xe8c27a },
  entanglingVinesWater: { minLong: 0, glowAlpha: 0.75, glowScale: 1.3, glowTint: 0x9ad8ff },
  entanglingVinesAir: { minLong: 0, glowAlpha: 0.75, glowScale: 1.3, glowTint: 0xeaf4ff },
  stick: { minLong: 56, glowAlpha: 0.9, glowScale: 1.45, glowTint: 0x2a1204, dark: true },
  // Void sprites are the darkest in the game (docs/ABILITY-AUDIT.md): a pale, desaturated ash-violet rim lifts them off dark floors.
  chaosBolt: { minLong: 56, glowAlpha: 0.85, glowScale: 1.6, glowTint: 0xa99cc4 },
  chaosOrb: { minLong: 0, glowAlpha: 0.8, glowScale: 1.35, glowTint: 0xa99cc4 },
  // Curomo (water): a cold pale-cyan halo lifts the thin Shards of Ice bolts and the Ice Shock lance off warm and dark floors.
  shardsOfIce: { minLong: 64, glowAlpha: 0.9, glowScale: 2.1, glowTint: 0xa8e4ff },
  iceShock: { minLong: 0, glowAlpha: 0.55, glowScale: 1.18, glowTint: 0x9fdcff },
  crimsonFire: { minLong: 96, glowAlpha: 1, glowScale: 1.8, glowTint: 0xffe9a0 },
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

/**
 * View-only: the Snag rope is drawn in the caster's element (green vine for nature/earth holders such as Treenoc, a kelp-blue cord for
 * water, a wind-spun cord for air). Art from tools/assets/fx-gen/batch-g-snag-rope.py; every other sprite or element is unchanged.
 */
const SNAG_ART: Readonly<Record<string, string>> = { water: 'entanglingVinesWater', air: 'entanglingVinesAir' };
export function snagSpriteFor(sprite: string, casterElement: string | undefined): string {
  return sprite === 'entanglingVines' && casterElement !== undefined ? (SNAG_ART[casterElement] ?? sprite) : sprite;
}

/** Looping projectile strips play at this many frames per second (8 frames: a 0.67 s loop). */
export const LOOP_FPS = 12;
/** Frame index of a looping strip at wall-clock `nowMs` (view-only; the sim never sees it). */
export function loopFrameAt(nowMs: number, frames: number): number {
  return frames <= 0 ? 0 : Math.floor((nowMs * LOOP_FPS) / 1000) % frames;
}

/** Texture key and manifest entry for an ability sprite (`sprite:` first, then `map:`). */
export function lookup(sprite: string): { key: string; entry: Entry } | undefined {
  const a = SPRITES[sprite];
  if (a) return { key: `sprite:${sprite}`, entry: a };
  const m = MAP_SPRITES[sprite];
  return m ? { key: `map:${sprite}`, entry: m } : undefined;
}

/** Render clock for age-based easing: the sim tick and the interpolation fraction. `remainingMs` (optional) is the melee box's time left, for the fade-out. */
export interface ProjectileClock { readonly tick: number; readonly alpha: number; readonly remainingMs?: number }
/** Pixels to add to a melee box's drawn position so it follows the smoothly drawn caster (drawn body minus its sim position). */
export interface ProjectileShift { readonly dx: number; readonly dy: number }
const TICK_MS = 20;

/** One pooled projectile sprite, drawn about its centre so rotation pivots like legacy `origin("center")`. */
export class ProjectileView {
  readonly image: Phaser.GameObjects.Image;
  /** Soft additive halo behind the sprite so small bolts and dashes have depth against bright arenas (the same frame, enlarged). */
  readonly glow: Phaser.GameObjects.Image;
  private key = '';
  private artW = 0;
  private artH = 0;
  private loopFrames = 0;
  private id = -1;
  /** Render time (in ticks, tick + alpha) when this id was first drawn; undefined until a clock is passed. */
  private born: number | undefined;

  constructor(private readonly scene: Phaser.Scene) {
    this.glow = scene.add.image(0, 0, '__DEFAULT').setOrigin(0.5, 0.5).setVisible(false).setBlendMode(BLEND_ADD).setAlpha(0.5);
    this.image = scene.add.image(0, 0, '__DEFAULT').setOrigin(0.5, 0.5).setVisible(false);
  }

  /**
   * `melee`: a melee box (Ice Shock, Ground Shock, ...) drawn stretched over its hit box, mirrored west and turned for north/south.
   * Optional view-only smoothing (omit all three and the drawing is unchanged): `clock` gives the age for the shock grow-in and
   * fade-out and the Hurricane spin and pulse; `shift` moves lunge and spin boxes with the smoothly drawn caster; `reduced` drops
   * scale, spin and pulse (shock boxes then only fade in).
   */
  apply(p: RenderProjectile, alpha: number, melee = false, casterElement?: string, clock?: ProjectileClock, shift?: ProjectileShift, reduced = false): void {
    if (p.id !== this.id) {
      this.id = p.id;
      this.born = clock ? clock.tick + clock.alpha : undefined;
    }
    if (clock && this.born === undefined) this.born = clock.tick + clock.alpha;
    const ageMs = clock && this.born !== undefined ? Math.max(0, (clock.tick + clock.alpha - this.born) * TICK_MS) : 0;
    const kind = melee ? SMOOTH_KIND[p.sprite] : undefined;
    const art = snagSpriteFor(p.sprite, casterElement);
    if (art !== this.key) {
      this.key = art;
      this.artW = 0;
      this.artH = 0;
      this.loopFrames = 0;
      const found = lookup(art);
      if (found) {
        const tex = this.scene.textures.get(found.key);
        const [fx = 0, fy = 0, fw = 80, fh = 80] = found.entry.coords;
        if (!tex.has(FRAME)) tex.add(FRAME, 0, fx, fy, fw, fh);
        this.artW = fw;
        this.artH = fh;
        this.image.setTexture(found.key, FRAME);
        this.glow.setTexture(found.key, FRAME);
        // Painted looping strip (tools/assets/fx-gen/batch-i-loops-impacts.py), drawn at the static art's size.
        const loop = SPRITES[`${art}Loop`];
        const lkey = `sprite:${art}Loop`;
        if (loop && this.scene.textures.exists(lkey)) {
          const lt = this.scene.textures.get(lkey);
          const [, , lw = 0, lh = 0] = loop.coords;
          const n = lw > 0 ? Math.floor(lt.getSourceImage().width / lw) : 0;
          if (n > 1) {
            for (let i = 0; i < n; i++) if (!lt.has(`loop${String(i)}`)) lt.add(`loop${String(i)}`, 0, i * lw, 0, lw, lh);
            this.loopFrames = n;
            this.image.setTexture(lkey, 'loop0');
            this.glow.setTexture(lkey, 'loop0');
          }
        }
      }
    }
    if (this.loopFrames > 0) {
      const f = `loop${String(loopFrameAt(reduced ? 0 : this.scene.time.now, this.loopFrames))}`;
      this.image.setFrame(f);
      this.glow.setFrame(f);
    }
    // The pose layer multiplies alpha after this runs (spawn ease-in); reset it every frame or pooled bolts dim for good.
    // Arcade Fire Blast falloff (FUN-DESIGN 2.27): the sim says how faded (alphaPm) and how much the box grew (growPx).
    let fade = melee ? 1 : (p.alphaPm ?? 1000) / 1000;
    let scale = 1;
    if (clock && kind === 'shock') {
      const g = meleeGrowIn(ageMs, reduced);
      scale = g.scale;
      fade = g.alpha * (clock.remainingMs === undefined ? 1 : meleeFadeOut(clock.remainingMs));
    }
    if (clock && kind === 'spin' && !reduced) scale = pulseBump(ageMs);
    const grown = melee ? 0 : (p.growPx ?? 0);
    this.image.setVisible(true).setAlpha(fade);
    const look = melee ? meleeLook(p.dir, p.w, p.h) : { angle: rotationForDir(p.dir, p.sprite), w: p.w, h: p.h, flip: false };
    const boost = SPRITE_BOOST[art];
    if (melee) look.h *= MELEE_ART_THICKNESS[p.sprite] ?? 1;
    else if (this.artW > 0) Object.assign(look, boltDisplaySize(p.w - grown, p.h - grown, this.artW, this.artH, Math.max(MIN_BOLT_LONG_SIDE, boost?.minLong ?? 0)));
    if (grown > 0) { look.w += grown; look.h += grown; }
    look.w *= scale;
    look.h *= scale;
    this.image.setDisplaySize(look.w, look.h).setFlipX(look.flip);
    // Melee boxes carry no previous position (px/py unset): never lerp from it. Lunge and spin boxes follow the caster each tick, so
    // the caller's `shift` (drawn caster minus sim caster) keeps the art on the smoothly drawn body.
    const a = melee ? 1 : alpha;
    const follow = kind === 'lunge' || kind === 'spin' ? shift : undefined;
    this.image.setPosition(lerp(p.px, p.x, a) + p.w / 2 + (follow?.dx ?? 0), lerp(p.py, p.y, a) + p.h / 2 + (follow?.dy ?? 0));
    if (clock && kind === 'spin') look.angle += (hurricaneSpin(ageMs, reduced) * 180) / Math.PI;
    this.image.setAngle(look.angle);
    // Thin bolts get a proportionally larger halo; both grow around the same centre; the pose layer turns the halo with the sprite.
    this.glow
      .setVisible(true)
      .setAlpha((boost?.glowAlpha ?? (melee ? 0.2 : 0.5)) * fade)
      .setDisplaySize(look.w * (boost?.glowScale ?? (melee ? 1 : 1.6)) + 6, look.h * (boost?.glowScale ?? (melee ? 1 : 1.6)) + 6)
      .setTint(boost?.glowTint ?? 0xffffff)
      .setBlendMode(boost?.dark === true ? BLEND_NORMAL : BLEND_ADD)
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
