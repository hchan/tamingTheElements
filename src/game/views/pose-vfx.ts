import type Phaser from 'phaser';
import { ELEMENT_COLORS } from '../fx/element-colors';
import { ELEMENT_FX, FX_ELEMENTS, GlowMode, fade, glowLook, lcg, spread, unit } from './pose-vfx-math';

/**
 * Ability VFX of the pose layer (WP-ability-vfx, FUN-DESIGN 3), Arcade only and view only: a per-element charge glow with
 * converging motes while a super (or Charge) winds up, a short release flare at every cast, element-shaped projectile
 * trails, a distinct impact burst per element and a ring plus radial burst when a super's charge completes. Everything
 * comes from events and the render view the pose layer already reads; one fixed pool of additive mote Images (created on
 * first use, reused, never allocated per frame) and one glow Image per character slot. Reduced motion: no particles, no
 * trails, and each effect shrinks to one static glow that fades in about 150 ms.
 */

const MOTE_KEY = 'tte:mote';
const BLEND_ADD = 1;
const PARTS = 80;
const SLOTS = 64;
const DEPTH = 8;
const SIZE = 1.4;
const GLOW_SCALE = 3.2;
const RELEASE_MS = 150;
const REDUCED_MS = 150;
const GATHER_MS = 55;
const GATHER_R = 36;
const GATHER_LIFE = 280;
const RING_R = 24;

export class PoseVfx {
  private readonly imgs: (Phaser.GameObjects.Image | undefined)[] = new Array<undefined>(PARTS).fill(undefined);
  private readonly on = new Uint8Array(PARTS);
  private readonly px = new Float64Array(PARTS);
  private readonly py = new Float64Array(PARTS);
  private readonly vx = new Float64Array(PARTS);
  private readonly vy = new Float64Array(PARTS);
  private readonly gr = new Float64Array(PARTS);
  private readonly age = new Float64Array(PARTS);
  private readonly life = new Float64Array(PARTS);
  private readonly s0 = new Float64Array(PARTS);
  private readonly s1 = new Float64Array(PARTS);
  private readonly a0 = new Float64Array(PARTS);
  private next = 0;
  private rng = 0x2545f491;
  private readonly dir = { x: 0, y: 0 };
  private readonly look = { scale: 1, alpha: 1 };
  private readonly key: string;
  // Per character slot: anchor and element, the glow state, and per projectile slot the trail carry.
  private readonly cx = new Float64Array(SLOTS);
  private readonly cy = new Float64Array(SLOTS);
  private readonly el = new Uint8Array(SLOTS);
  private readonly gMode = new Uint8Array(SLOTS);
  private readonly gAge = new Float64Array(SLOTS);
  private readonly gMs = new Float64Array(SLOTS);
  private readonly gSuper = new Uint8Array(SLOTS);
  private readonly gAcc = new Float64Array(SLOTS);
  private readonly gImg: (Phaser.GameObjects.Image | undefined)[] = new Array<undefined>(SLOTS).fill(undefined);
  private readonly tx = new Float64Array(SLOTS);
  private readonly ty = new Float64Array(SLOTS);
  private readonly carry = new Float64Array(SLOTS);

  constructor(private readonly scene: Phaser.Scene) {
    this.key = scene.textures.exists(MOTE_KEY) ? MOTE_KEY : '__DEFAULT';
  }

  /** Motes or glows currently showing (test probe). */
  get live(): number {
    let n = 0;
    for (let i = 0; i < PARTS; i++) n += this.on[i] ?? 0;
    for (let i = 0; i < SLOTS; i++) n += (this.gMode[i] ?? 0) === GlowMode.none ? 0 : 1;
    return n;
  }

  /** Where character `slot` is drawn (box centre) and its element index, refreshed every frame. */
  anchor(slot: number, x: number, y: number, element: number): void {
    this.cx[slot] = x;
    this.cy[slot] = y;
    this.el[slot] = element;
  }

  /** A wind-up: a swelling glow that, for a super, ends in a ring and a radial burst. */
  charge(slot: number, ms: number, isSuper: boolean): void {
    this.gMode[slot] = GlowMode.charge;
    this.gAge[slot] = 0;
    this.gMs[slot] = ms;
    this.gSuper[slot] = isSuper ? 1 : 0;
    this.gAcc[slot] = 0;
  }

  /** The release flare at a cast (does not interrupt a charge in progress). */
  release(slot: number): void {
    if (this.gMode[slot] === GlowMode.charge) return;
    this.gMode[slot] = GlowMode.release;
    this.gAge[slot] = 0;
    this.gMs[slot] = RELEASE_MS;
    this.gSuper[slot] = 0;
  }

  /** One projectile frame at (x, y): drops a puff each `trailGap` px travelled (`fresh`: first frame of this projectile). */
  trail(slot: number, x: number, y: number, element: number, fresh: boolean, reduced: boolean): void {
    if (fresh) this.carry[slot] = 0;
    else if (!reduced) {
      const fx = ELEMENT_FX[FX_ELEMENTS[element] ?? 'void'];
      const d = Math.hypot(x - (this.tx[slot] ?? x), y - (this.ty[slot] ?? y));
      const c = (this.carry[slot] ?? 0) + d;
      if (c >= fx.trailGap) {
        this.carry[slot] = c - fx.trailGap;
        this.spawn(x, y, 0, fx.trailVy, 0, fx.trailMs, fx.trailS0, fx.trailS1, 0.55, element);
      } else this.carry[slot] = c;
    }
    this.tx[slot] = x;
    this.ty[slot] = y;
  }

  /** The element's impact burst at (x, y); reduced: one static flash. */
  impact(x: number, y: number, element: number, reduced: boolean): void {
    if (reduced) this.spawn(x, y, 0, 0, 0, REDUCED_MS, 1.6, 1.6, 0.7, element);
    else this.burst(x, y, element, 1, 1);
  }

  /** Advances every effect by `dt` ms of wall time. */
  frame(dt: number, reduced: boolean): void {
    for (let i = 0; i < SLOTS; i++) {
      if ((this.gMode[i] ?? 0) !== GlowMode.none) this.glow(i, dt, reduced);
    }
    for (let i = 0; i < PARTS; i++) {
      if (this.on[i] !== 1) continue;
      const img = this.imgs[i];
      const age = (this.age[i] ?? 0) + dt;
      const t = age / (this.life[i] || 1);
      if (!img || t >= 1) {
        this.on[i] = 0;
        img?.setVisible(false);
        continue;
      }
      const s = dt / 1000;
      this.age[i] = age;
      this.vy[i] = (this.vy[i] ?? 0) + (this.gr[i] ?? 0) * s;
      this.px[i] = (this.px[i] ?? 0) + (this.vx[i] ?? 0) * s;
      this.py[i] = (this.py[i] ?? 0) + (this.vy[i] ?? 0) * s;
      const a = this.s0[i] ?? 1;
      img.setPosition(this.px[i] ?? 0, this.py[i] ?? 0).setScale((a + ((this.s1[i] ?? a) - a) * t) * SIZE).setAlpha((this.a0[i] ?? 1) * fade(t));
    }
  }

  private glow(i: number, dt: number, reduced: boolean): void {
    const mode = this.gMode[i] ?? 0;
    const ms = reduced ? REDUCED_MS : (this.gMs[i] ?? 1);
    const age = (this.gAge[i] ?? 0) + dt;
    this.gAge[i] = age;
    const element = this.el[i] ?? 0;
    const x = this.cx[i] ?? 0;
    const y = this.cy[i] ?? 0;
    if (age >= ms) {
      this.gMode[i] = GlowMode.none;
      this.gImg[i]?.setVisible(false);
      if (!reduced && mode === GlowMode.charge && this.gSuper[i] === 1) {
        this.spawn(x, y, 0, 0, 0, 320, 1, 9, 0.6, element);
        this.burst(x, y, element, 1.8, 1.5);
      }
      return;
    }
    let img = this.gImg[i];
    if (!img) {
      img = this.scene.add.image(0, 0, this.key).setBlendMode(BLEND_ADD).setDepth(DEPTH - 1);
      this.gImg[i] = img;
    }
    // Reduced motion shows every glow as a brief release-style fade, whatever started it.
    glowLook(reduced ? GlowMode.release : mode, age / ms, reduced, this.look);
    img.setVisible(true).setTint(ELEMENT_COLORS[FX_ELEMENTS[element] ?? 'void']).setPosition(x, y).setScale(this.look.scale * GLOW_SCALE).setAlpha(this.look.alpha);
    if (!reduced && mode === GlowMode.charge && this.gSuper[i] === 1) {
      this.gAcc[i] = (this.gAcc[i] ?? 0) + dt;
      while ((this.gAcc[i] ?? 0) >= GATHER_MS) {
        this.gAcc[i] = (this.gAcc[i] ?? 0) - GATHER_MS;
        this.draw();
        const k = (GATHER_R * 1000) / GATHER_LIFE;
        this.spawn(x + this.dir.x * GATHER_R, y + this.dir.y * GATHER_R, -this.dir.x * k, -this.dir.y * k, 0, GATHER_LIFE, 0.5, 0.9, 0.8, element);
      }
    }
  }

  /** `count x mul` motes in the element's burst shape; `size` scales them. */
  private burst(x: number, y: number, element: number, mul: number, size: number): void {
    const fx = ELEMENT_FX[FX_ELEMENTS[element] ?? 'void'];
    const n = Math.round(fx.count * mul);
    for (let k = 0; k < n; k++) {
      this.draw();
      const inward = fx.speed < 0;
      const sp = fx.speed * (0.7 + 0.6 * this.rand());
      const ox = inward ? this.dir.x * RING_R : 0;
      const oy = inward ? this.dir.y * RING_R : 0;
      this.spawn(x + ox, y + oy, this.dir.x * sp, this.dir.y * sp + fx.bias, fx.gravity, fx.ms * (0.8 + 0.4 * this.rand()), fx.s0 * size, fx.s1 * size, 0.9, element);
    }
  }

  private rand(): number {
    this.rng = lcg(this.rng);
    return unit(this.rng);
  }

  /** Draws a fresh direction into `dir`. */
  private draw(): void {
    spread(this.rand(), this.rand(), this.dir);
  }

  private spawn(x: number, y: number, vx: number, vy: number, g: number, life: number, s0: number, s1: number, a0: number, element: number): void {
    let i = -1;
    for (let k = 0; k < PARTS; k++) {
      const j = (this.next + k) % PARTS;
      if (this.on[j] !== 1) {
        i = j;
        break;
      }
    }
    if (i < 0) return;
    this.next = (i + 1) % PARTS;
    this.imgs[i] ??= this.scene.add.image(0, 0, this.key).setBlendMode(BLEND_ADD).setDepth(DEPTH);
    this.on[i] = 1;
    this.px[i] = x;
    this.py[i] = y;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.gr[i] = g;
    this.age[i] = 0;
    this.life[i] = life;
    this.s0[i] = s0;
    this.s1[i] = s1;
    this.a0[i] = a0;
    this.imgs[i]?.setVisible(true).setTint(ELEMENT_COLORS[FX_ELEMENTS[element] ?? 'void']).setPosition(x, y).setScale(s0 * SIZE).setAlpha(a0);
  }

  destroy(): void {
    for (const i of this.imgs) i?.destroy();
    for (const i of this.gImg) i?.destroy();
    this.on.fill(0);
    this.gMode.fill(0);
  }
}
