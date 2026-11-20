import type Phaser from 'phaser';
import { EntityFlag, StatusId, arcadePlayfield, type Element, type RenderCharacter, type RenderView } from '@core/index';
import manifest from '../assets/manifest.generated.json';
import { gradedHeroTexture } from '../fx/hero-grade';
import { LUNGE_TICKS, RECOIL_TICKS, lungeOffset, recoilPose } from '../fx/hit-feel';
import { HERO_IMAGE_NAME, arcadeHeroScale, boxSpanX, clampSpanX, visualBox, type Box, type SpanX } from './hero-scale';
import { SHADOW_ALPHA_CAP } from './pose-depth';

/** Classic draws sprites this much larger than their hitbox, anchored at the feet centre (display only; the box is unchanged). */
export const CLASSIC_SPRITE_SCALE = 1.4;
export const FROZEN_TINT = 0x88ccff;
/**
 * Hit flash (FUN-DESIGN section 3, VISUAL-QA V6): a bright additive wash for 2 rendered frames, then the hit tint for 8 (red in
 * Classic, so a hit reads as an injury). Additive, not a solid fill: a fill paints every opaque or soft-edged texel pure white
 * and reads as a hard rectangle; adding light keeps the baked outline and shading, so the flash follows the silhouette.
 */
export const FLASH_FILL_FRAMES = 2;
/** Presentation-only hit-stop: at most this many rendered frames the flash holds on a heavy hit (the sim is never paused). */
export const MAX_HOLD_FRAMES = 6;
export const FLASH_TINT_FRAMES = 8;
/** Peak and tail of the flash light, as the alpha of an additive copy of the sprite (so it can only light texels the sprite has). */
export const FLASH_WASH_ALPHA = 0.38;
export const FLASH_TAIL_ALPHA = 0.12;
/** Hit-stop jitter amplitude in px. */
export const JITTER_PX = 2;
/** Phaser.TintModes values (a type-only Phaser import keeps this module loadable in Node tests). */
const TINT_MULTIPLY = 0;

export type TintStage = 'wash' | 'hit' | 'frozen' | 'none';

/** Alpha of the additive flash copy for the flash frames left: a short peak, then a soft linear fade (QA r26: no hard tinted cut-outs). */
export function flashWashAlpha(flashLeft: number): number {
  if (flashLeft > FLASH_TINT_FRAMES) return FLASH_WASH_ALPHA;
  return flashLeft > 0 ? (FLASH_TAIL_ALPHA * flashLeft) / FLASH_TINT_FRAMES : 0;
}

/** `c` moved halfway to white (the flash light is the hit colour, lifted so it reads as light, not a stain). */
export function liftToWhite(c: number): number {
  const r = (c >> 16) & 0xff, g = (c >> 8) & 0xff, b = c & 0xff;
  return (((r + 255) >> 1) << 16) | (((g + 255) >> 1) << 8) | ((b + 255) >> 1);
}

/** Which tint a character shows this frame, given the flash frames left: the flash wins over the frozen tint. */
/**
 * Whether a character shows the ice-blue freeze tint: only a Classic Tornado victim (status 5 live, legacy `freeze()` with
 * the colour change). Never in Arcade, where the `frozen` flag is never a victim freeze. The flag alone is not enough: it is
 * also set during a melee caster's cast recovery (PARITY C08), which legacy did not tint (`freeze(true)`).
 */
export function frozenTintOf(view: RenderView, id: number, arcade: boolean): boolean {
  if (arcade) return false;
  let tornado = false;
  view.forEachStatus(id, (st) => {
    if (st.id === StatusId.tornado) tornado = true;
  });
  return tornado;
}

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
export const GLOW_SPRITES: ReadonlySet<string> = new Set(['wispera', 'echo', 'lavax', 'hyalia', 'zephra', 'umbrel']);
/** Lavax is near-black basalt: its light is a warm molten gold, so it reads as lit from within on the fire and earth floors. */
const GLOW_TINT_BY_SPRITE: Readonly<Record<string, number>> = { lavax: 0xffa850 };
const GLOW_KEY = 'hero-glow';
const SOFT_GLOW_KEY = 'hero-glow-soft';
/** Lavax rim alphas: lower than the pale heroes because additive gold piles up on the bright air floor. */
const LAVAX_GLOW_ALPHA = 0.5;
const LAVAX_HALO_ALPHA = 0.5;
const GLOW_TINT = 0xb4d2ff;
const GLOW_ALPHA = 0.65;
const HALO_ALPHA = 0.4;
/** Normal-blend deep-indigo aura behind every hero: a pale or stony body keeps a dark edge on the bright air floor (display only). */
const AURA_TINT = 0x120c28;
const AURA_ALPHA = 0.42;
/** On the bright air floor the pale beings (Echo, Wispera) lose their additive light (it washes out) and get a deeper, wider aura instead. */
const BRIGHT_AURA_ALPHA = 0.7;
const BRIGHT_PALE: ReadonlySet<string> = new Set(['wispera', 'echo']);
let brightFloor = false;
/** The Arena says whether the floor this frame is the bright air stage (display only; one view per scene, so a module flag is enough). */
export function setBrightFloor(on: boolean): void {
  brightFloor = on;
}

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

/** A gaussian-style falloff (many stops, no visible edge) for the molten rim so it never reads as a blotch on a bright floor. */
function softGlowTexture(scene: Phaser.Scene): string | undefined {
  try {
    if (scene.textures.exists(SOFT_GLOW_KEY)) return SOFT_GLOW_KEY;
    const t = scene.textures.createCanvas(SOFT_GLOW_KEY, 64, 64);
    const ctx = t?.getContext();
    if (!t || !ctx) return undefined;
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    for (let i = 0; i < 8; i++) {
      const k = 1 - i / 8;
      g.addColorStop(i / 8, `rgba(255,255,255,${(0.7 * k * k * k).toFixed(3)})`);
    }
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    t.refresh();
    return SOFT_GLOW_KEY;
  } catch {
    return undefined;
  }
}

/** One pooled character sprite; `apply` is the only thing that touches Phaser state each frame. */
export class CharacterView {
  readonly image: Phaser.GameObjects.Image;
  private glow: Phaser.GameObjects.Image | undefined;
  private halo: Phaser.GameObjects.Image | undefined;
  private aura: Phaser.GameObjects.Image | undefined;
  /** Soft elliptical ground shadow under the feet (Arcade, `fit`). */
  private shadow: Phaser.GameObjects.Image | undefined;
  /** The shadow as `placeShadow` last set it (the depth step offsets from these). */
  private shadowX = 0;
  private shadowY = 0;
  private shadowW = 0;
  private shadowA = 0;
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
  /** The additive flash copy of the sprite, and the alpha it shows this frame (0 = off). It is synced to `image` just before render. */
  private wash: Phaser.GameObjects.Image | undefined;
  washAlpha = 0;
  private washSync: (() => void) | undefined;
  private jitterUntil = 0;
  private jitterSign = 1;
  /** Hit squash-and-recoil (QA r34): the view tick the hit landed at (-1 none), its strength and push direction. */
  private recoilAt = -1;
  private recoilStrength = 0;
  private recoilDir = 1;
  /** Attacker lunge (QA r39): view tick of the landed blow (-1 none), strength and direction. */
  private lungeAt = -1;
  private lungeStrength = 0;
  private lungeDir = 1;
  private lastTick = 0;
  private lastAlpha = 0;
  /** True once this frame's recoil has been applied after the pose layer (it must not compound while paused). */
  private recoilDone = false;
  /** Scratch for the drawn body box and its rotated x-span (no per-frame allocation). */
  private readonly vbScratch: Box = { x: 0, y: 0, w: 0, h: 0 };
  private readonly spanScratch: SpanX = { min: 0, max: 0 };

  /**
   * `scale` is the display scale over the sim box (feet-anchored). With `fit` (Arcade) it is chosen per body from its box
   * height (`arcadeHeroScale`) so a giant does not fill the screen, and the hero gets a ground shadow.
   */
  constructor(private readonly scene: Phaser.Scene, public scale = 1, private readonly fit = false) {
    this.image = scene.add.image(0, 0, '__DEFAULT').setOrigin(0, 0).setVisible(false);
    // Tagged so the super cut can find every fighter's body on the display list (a plain field: view tests stub the image).
    this.image.name = HERO_IMAGE_NAME;
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

  /** Step towards a foe (`dirX` -1 or 1) for a blow that landed at view tick `tick`; drawn after the pose layer, see `applyRecoil`. */
  lunge(dirX: number, strength: number, tick: number): void {
    this.lungeAt = tick;
    this.lungeStrength = strength;
    this.lungeDir = dirX;
  }

  /** Squash and shove away from a hit (`dirX` -1 or 1) that landed at view tick `tick`; drawn after the pose layer, see `applyRecoil`. */
  recoil(dirX: number, strength: number, tick: number): void {
    this.recoilAt = tick;
    this.recoilStrength = strength;
    this.recoilDir = dirX;
    this.ensureHook();
  }

  /**
   * `live` is false while the sim is paused: the flash and jitter then hold their frame. `frozenTint` says whether to draw the
   * ice-blue freeze tint; it defaults to the `frozen` flag, but that flag is also set for a melee caster's ~13 ticks of cast
   * recovery (systems/melee.ts), so the scene passes `frozenTintOf` instead (legacy skipped the colour change there, abilities.js freeze(true)).
   */
  /** Test probe: the body image's drawn x (logical px). */
  get drawnX(): number {
    return this.image.x;
  }

  apply(c: RenderCharacter, tick: number, alpha: number, live = true, frozenTint = (c.flags & EntityFlag.frozen) !== 0, pos = alpha, shift?: { readonly dx: number; readonly dy: number }): void {
    this.element = c.element;
    const hidden = (c.flags & (EntityFlag.benched | EntityFlag.dead)) !== 0;
    this.image.setVisible(!hidden);
    if (hidden) {
      this.glow?.setVisible(false);
      this.halo?.setVisible(false);
      this.aura?.setVisible(false);
      this.shadow?.setVisible(false);
      this.flashLeft = 0;
      this.holdLeft = 0;
      this.washAlpha = 0;
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
    this.lastTick = tick;
    this.lastAlpha = alpha;
    this.recoilDone = false;
    let x = lerp(c.px, c.x, pos);
    let y = lerp(c.py, c.y, pos);
    if (tick < this.jitterUntil) {
      if (live) this.jitterSign = -this.jitterSign;
      x += JITTER_PX * this.jitterSign;
      y -= JITTER_PX * this.jitterSign;
    }
    if (this.fit) this.scale = arcadeHeroScale(c.h);
    const k = this.scale;
    // The drawn body box (tucked inside the world in Arcade): the image and every attachment follow it, not the sim x (WALL-3a).
    const vb = visualBox(x, y, c.w, c.h, k, this.vbScratch, this.fit ? arcadePlayfield().w : undefined);
    // `shift` (throw/pull smoothing, MotionSmoother.shiftFor) moves the drawn body only; attachments, hit boxes and the sim stay put.
    this.image.setPosition(vb.x + (shift?.dx ?? 0), vb.y + (shift?.dy ?? 0));
    this.image.setDisplaySize(vb.w, vb.h);
    this.image.setAlpha((c.flags & EntityFlag.translucent) !== 0 ? 0.5 : 1);
    const ax = this.fit ? vb.x : x;
    this.placeGlow(c.sprite, ax, y, c.w * k, c.h * k);
    this.placeAura(ax, y, c.w * k, c.h * k, (c.flags & EntityFlag.translucent) !== 0);
    this.placeShadow(this.fit ? vb.x + vb.w / 2 : x + c.w / 2, y + c.h, c.w, k, (c.flags & EntityFlag.translucent) !== 0);
    if (this.fit) this.ensureHook();
    const stage = tintStage(this.flashLeft, frozenTint);
    this.washAlpha = flashWashAlpha(this.flashLeft);
    if (live && this.flashLeft > 0) {
      if (this.holdLeft > 0) this.holdLeft--;
      else this.flashLeft--;
    }
    // The flash is light added by a second copy of the sprite (see `syncWash`), never a tint on the sprite itself: the tint
    // shader divides by texel alpha, which on transparent texels gave hard-edged clipped cut-outs (QA r26).
    if (stage === 'frozen') {
      this.tinted = true;
      this.image.setTint(FROZEN_TINT).setTintMode(TINT_MULTIPLY);
    } else if (this.tinted) {
      this.image.clearTint();
      this.tinted = false;
    }
    if (this.washAlpha > 0) this.ensureWash();
  }

  private ensureWash(): void {
    if (this.wash || !this.ensureHook()) return;
    this.wash = this.scene.add.image(0, 0, '__DEFAULT').setVisible(false).setBlendMode(1);
  }

  /** One prerender hook (after the pose layer): the hit recoil, then the flash copy. False in the unit-test fake scene (no events). */
  private ensureHook(): boolean {
    const events = this.scene.events as Phaser.Events.EventEmitter | undefined;
    if (!events) return false;
    if (!this.washSync) {
      this.washSync = (): void => {
        this.applyRecoil();
        this.clampToWorld();
        this.syncWash();
      };
      events.on('prerender', this.washSync);
    }
    return true;
  }

  /**
   * Last step of the frame (Arcade only): slides the drawn body back inside the world when the pose rotation or the
   * recoil/lunge shove pushed its box past a wall. It moves the body only; the attachments never took the shove.
   */
  private clampToWorld(): void {
    const i = this.image;
    if (!this.fit || !i.visible) return;
    const pf = arcadePlayfield();
    const span = boxSpanX(i, i.rotation, this.spanScratch);
    const dx = clampSpanX(span.min, span.max, pf.x, pf.x + pf.w);
    if (dx !== 0) i.x += dx;
  }

  /** Squashes and shoves the drawn sprite about its feet for a few ticks after a hit (the pose layer has already placed it). */
  private applyRecoil(): void {
    const i = this.image;
    if (this.lungeAt >= 0 && !this.recoilDone && i.visible) {
      const la = this.lastTick - this.lungeAt + this.lastAlpha;
      if (la >= LUNGE_TICKS) this.lungeAt = -1;
      else if (this.recoilAt < 0) {
        this.recoilDone = true;
        i.x += lungeOffset(la, this.lungeStrength, this.lungeDir, false);
        return;
      } else i.x += lungeOffset(la, this.lungeStrength, this.lungeDir, false);
    }
    if (this.recoilAt < 0 || this.recoilDone || !i.visible) return;
    const age = this.lastTick - this.recoilAt + this.lastAlpha;
    if (age >= RECOIL_TICKS) {
      this.recoilAt = -1;
      return;
    }
    this.recoilDone = true;
    const p = recoilPose(age, this.recoilStrength, this.recoilDir, false);
    const w = i.displayWidth;
    const h = i.displayHeight;
    const nw = w * p.sx;
    const nh = h * p.sy;
    const cx = i.x + w * (0.5 - i.originX) + p.dx;
    i.setPosition(cx - nw * (0.5 - i.originX), i.y + (h - nh) * (1 - i.originY)).setDisplaySize(nw, nh);
  }

  /** Copies the sprite's final pose (after the pose layer) onto the flash copy, at `washAlpha`. */
  private syncWash(): void {
    const w = this.wash;
    if (!w) return;
    const i = this.image;
    if (this.washAlpha <= 0 || !i.visible) {
      w.setVisible(false);
      return;
    }
    w.setTexture(i.texture.key, i.frame.name)
      .setOrigin(i.originX, i.originY)
      .setPosition(i.x, i.y)
      .setDisplaySize(i.displayWidth, i.displayHeight)
      .setAngle(i.angle)
      .setFlipX(i.flipX)
      .setDepth(i.depth + 0.05)
      .setTint(liftToWhite(this.flashTint))
      .setAlpha(this.washAlpha * i.alpha)
      .setVisible(true);
  }

  /** A soft ellipse of pale light under the feet for `GLOW_SPRITES`, so they read on dark floors. */
  private placeGlow(sprite: string, x: number, y: number, w: number, h: number): void {
    if (!GLOW_SPRITES.has(sprite) || (brightFloor && BRIGHT_PALE.has(sprite))) {
      this.glow?.setVisible(false);
      this.halo?.setVisible(false);
      return;
    }
    if (!this.glow) {
      const key = glowTexture(this.scene);
      if (!key) return;
      this.glow = this.scene.add.image(0, 0, key).setTint(GLOW_TINT).setAlpha(GLOW_ALPHA).setBlendMode(1);
    }
    const tint = GLOW_TINT_BY_SPRITE[sprite] ?? GLOW_TINT;
    const lavax = sprite === 'lavax';
    const softKey = lavax ? softGlowTexture(this.scene) : undefined;
    this.glow.setTexture(softKey ?? GLOW_KEY).setTint(tint).setAlpha(lavax ? LAVAX_GLOW_ALPHA : GLOW_ALPHA);
    this.glow.setVisible(true).setDepth(this.image.depth - 0.5);
    this.glow.setPosition(x + w / 2, y + h * 0.66).setDisplaySize(w * 1.15, h * 0.62);
    // A pale rim of light around the body (a soft halo just behind the sprite) so a dark or translucent hero keeps its outline on a dark floor.
    this.halo ??= this.scene.add.image(0, 0, this.glow.texture.key).setTint(GLOW_TINT).setAlpha(HALO_ALPHA).setBlendMode(1);
    this.halo.setTexture(softKey ?? GLOW_KEY).setTint(tint).setAlpha(lavax ? LAVAX_HALO_ALPHA : HALO_ALPHA).setVisible(true).setDepth(this.image.depth - 0.4);
    this.halo.setPosition(x + w / 2, y + h * 0.5).setDisplaySize(w * (sprite === 'lavax' ? 1.75 : 1.5), h * (sprite === 'lavax' ? 1.5 : 1.35));
  }

  /** A soft dark halo hugging the body (normal blend, above the additive glow) so every hero reads on a bright floor. */
  private placeAura(x: number, y: number, w: number, h: number, ghost: boolean): void {
    if (!this.aura) {
      const key = glowTexture(this.scene);
      if (!key) return;
      this.aura = this.scene.add.image(0, 0, key).setTint(AURA_TINT);
    }
    const pale = brightFloor && BRIGHT_PALE.has(this.spriteName);
    // Wispera is a small translucent mist: a wider, denser dark pool so it holds a silhouette on the pale ice (QA r22); Echo, a near-white tornado, gets a milder version (QA r129).
    const wisp = pale && this.spriteName === 'wispera';
    this.aura
      .setVisible(true)
      .setDepth(this.image.depth - 0.3)
      .setAlpha(pale ? Math.min(1, BRIGHT_AURA_ALPHA * (wisp ? 1.4 : 1.25)) * (ghost ? 0.8 : 1) : ghost ? AURA_ALPHA * 0.5 : AURA_ALPHA)
      .setPosition(x + w / 2, y + h * 0.52)
      .setDisplaySize(w * (pale ? (wisp ? 1.7 : 1.6) : 1.3), h * (pale ? (wisp ? 1.55 : 1.45) : 1.22));
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
    this.shadowX = cx;
    this.shadowY = feetY - 2;
    this.shadowW = sw;
    this.shadowA = ghost ? 0.25 : 0.55;
    this.shadow
      .setVisible(true)
      .setDepth(this.image.depth - 0.6)
      .setAlpha(this.shadowA)
      .setPosition(this.shadowX, this.shadowY)
      .setDisplaySize(sw, sw * 0.26);
  }

  /**
   * Depth step (pose-depth.ts): moves the shadow with the dropped feet, grows and darkens it. Applies on top of the base
   * placement of this frame, so it is idempotent (apply() re-places the shadow every frame).
   */
  shadowPose(dx: number, dy: number, scaleMul: number, alphaMul: number): void {
    const sh = this.shadow;
    if (!this.fit || !sh || !sh.visible) return;
    const sw = this.shadowW * scaleMul;
    sh.setPosition(this.shadowX + dx, this.shadowY + dy).setDisplaySize(sw, sw * 0.26).setAlpha(Math.min(SHADOW_ALPHA_CAP, this.shadowA * alphaMul));
  }

  hide(): void {
    this.glow?.setVisible(false);
    this.halo?.setVisible(false);
    this.aura?.setVisible(false);
    this.shadow?.setVisible(false);
    this.image.setVisible(false);
    this.flashLeft = 0;
    this.holdLeft = 0;
    this.jitterUntil = 0;
    this.recoilAt = -1;
    this.lungeAt = -1;
    this.washAlpha = 0;
    this.wash?.setVisible(false);
  }

  destroy(): void {
    if (this.washSync) (this.scene.events as Phaser.Events.EventEmitter | undefined)?.off('prerender', this.washSync);
    this.wash?.destroy();
    this.glow?.destroy();
    this.halo?.destroy();
    this.aura?.destroy();
    this.shadow?.destroy();
    this.image.destroy();
  }
}
