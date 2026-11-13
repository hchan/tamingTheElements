import type Phaser from 'phaser';
import type { Element } from '@core/index';
import { ELEMENT_COLORS } from '../fx/element-colors';

/**
 * Classic arena dressing (presentation only): the element background is tinted and darkened, a vignette and a
 * ground-depth gradient frame the fight, and a few pooled motes drift in the element's own way. The pure motion rules
 * are exported for tests; Phaser objects are created once in `create` and destroyed in `destroy` (no listeners).
 */
export const MOTE_COUNT = 26;
const W = 1280;
const H = 720;
/** Multiply tint per element on the (pale) background art: darkens it and gives each arena its own colour. */
export const BACKDROP_TINT: Readonly<Record<Element, number>> = {
  fire: 0xa8715a, air: 0x7d8ea3, earth: 0x8f7a5a, water: 0x52708f, void: 0x75678f,
};
const VIGNETTE_KEY = 'tte:vignette';
const MOTE_KEY = 'tte:mote';

/** Drift per second (px) and size range per element; negative vy rises. */
export const MOTE_DRIFT: Readonly<Record<Element, { vx: number; vy: number; size: number }>> = {
  fire: { vx: 6, vy: -46, size: 0.7 },
  air: { vx: 60, vy: -4, size: 0.5 },
  earth: { vx: 8, vy: 10, size: 0.8 },
  water: { vx: 4, vy: -22, size: 0.9 },
  void: { vx: -10, vy: -12, size: 0.8 },
};

export interface Mote {
  x: number;
  y: number;
  /** 0.5..1.5 speed factor and 0..2pi sway phase (as an integer step of a sway table; no trig here). */
  speed: number;
  phase: number;
  alpha: number;
}

/** Small integer hash in 0..1 (so layouts are reproducible without Math.random). */
export function unit(seed: number): number {
  let h = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function seedMotes(count = MOTE_COUNT): Mote[] {
  const out: Mote[] = [];
  for (let i = 0; i < count; i++) {
    out.push({ x: unit(i * 4 + 1) * W, y: unit(i * 4 + 2) * H, speed: 0.5 + unit(i * 4 + 3), phase: unit(i * 4 + 4) * 6, alpha: 0.12 + unit(i * 7 + 5) * 0.28 });
  }
  return out;
}

/** Advances one mote by `dtMs`, wrapping at the screen edges. */
export function stepMote(m: Mote, element: Element, dtMs: number): void {
  const d = MOTE_DRIFT[element];
  const dt = dtMs / 1000;
  m.x += d.vx * m.speed * dt;
  m.y += d.vy * m.speed * dt;
  m.phase += dt;
  if (m.x > W + 8) m.x -= W + 16;
  else if (m.x < -8) m.x += W + 16;
  if (m.y > H + 8) m.y -= H + 16;
  else if (m.y < -8) m.y += H + 16;
}

function ensureTextures(scene: Phaser.Scene): void {
  const tex = scene.textures;
  if (!tex.exists(VIGNETTE_KEY)) {
    const t = tex.createCanvas(VIGNETTE_KEY, 320, 180);
    const ctx = t?.getContext();
    if (t && ctx) {
      const r = ctx.createRadialGradient(160, 90, 40, 160, 90, 200);
      r.addColorStop(0, 'rgba(0,0,0,0)');
      r.addColorStop(1, 'rgba(0,0,0,0.62)');
      ctx.fillStyle = r;
      ctx.fillRect(0, 0, 320, 180);
      // Depth: the far (top) edge hazes darker, the foreground (bottom) fades down toward the action bar.
      const v = ctx.createLinearGradient(0, 0, 0, 180);
      v.addColorStop(0, 'rgba(10,14,30,0.35)');
      v.addColorStop(0.35, 'rgba(10,14,30,0)');
      v.addColorStop(0.75, 'rgba(0,0,0,0)');
      v.addColorStop(1, 'rgba(0,0,0,0.4)');
      ctx.fillStyle = v;
      ctx.fillRect(0, 0, 320, 180);
      // Film grain (seeded hash, not Math.random): scaled up 4x it reads as soft painterly tooth over the pale art.
      const px = ctx.getImageData(0, 0, 320, 180);
      for (let i = 3; i < px.data.length; i += 4) px.data[i] = Math.max(px.data[i] ?? 0, unit(i) * 45);
      ctx.putImageData(px, 0, 0);
      t.refresh();
    }
  }
  if (!tex.exists(MOTE_KEY)) {
    const t = tex.createCanvas(MOTE_KEY, 16, 16);
    const ctx = t?.getContext();
    if (t && ctx) {
      const g = ctx.createRadialGradient(8, 8, 0, 8, 8, 8);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 16, 16);
      t.refresh();
    }
  }
}

export class Backdrop {
  private readonly objects: Phaser.GameObjects.Image[] = [];
  private readonly sprites: Phaser.GameObjects.Image[] = [];
  private readonly motes = seedMotes();
  private still = false;

  constructor(scene: Phaser.Scene, private readonly element: Element, bgKey: string | undefined) {
    ensureTextures(scene);
    if (bgKey) {
      this.objects.push(scene.add.image(0, 0, bgKey).setOrigin(0, 0).setDisplaySize(W, H).setDepth(-1).setTint(BACKDROP_TINT[element]));
    }
    this.objects.push(scene.add.image(0, 0, VIGNETTE_KEY).setOrigin(0, 0).setDisplaySize(W, H).setDepth(-0.4));
    const color = ELEMENT_COLORS[element];
    for (const m of this.motes) {
      const s = MOTE_DRIFT[element].size;
      this.sprites.push(
        scene.add.image(m.x, m.y, MOTE_KEY).setDepth(-0.6).setTint(color).setBlendMode(1).setAlpha(m.alpha).setScale(s * (0.6 + m.speed)),
      );
    }
    this.render();
  }

  /** `reduced`: motes stay where they are (no drift, no sway). */
  update(dtMs: number, reduced: boolean): void {
    if (reduced && this.still) return;
    this.still = reduced;
    if (!reduced) for (const m of this.motes) stepMote(m, this.element, dtMs);
    this.render();
  }

  private render(): void {
    this.motes.forEach((m, i) => {
      // Sway by a triangle wave of the phase (no sin: keeps this module free of engine-dependent maths).
      const t = m.phase % 2;
      const sway = (t < 1 ? t : 2 - t) - 0.5;
      this.sprites[i]?.setPosition(m.x + (this.still ? 0 : sway * 14), m.y);
    });
  }

  destroy(): void {
    for (const o of [...this.objects, ...this.sprites]) o.destroy();
    this.objects.length = 0;
    this.sprites.length = 0;
  }
}
