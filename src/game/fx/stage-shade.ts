import type Phaser from 'phaser';

/**
 * Value separation between fighters and the stage floor (view only), above the painted floor and below the ground shadow and
 * the sprites, so fighters never get a darker or lighter hero art, only a floor that contrasts with them:
 * - Fire (QA r128: Sindarosa and Fiara sit on the same orange-brown as the floor): a soft dark umber pool under each fighter's
 *   body (the fighting-game way: value contrast, not an outline). Skipped under high contrast, which draws its own outlines.
 * - Air (r30: the floor is near white, so pale fighters vanish): one soft indigo wash over the whole floor.
 * A fixed pool of images, one generated texture and one rectangle; nothing allocates per frame.
 */
export const SHADE_DEPTH = -0.65;
/** Dark umber (never pure black, so the floor stays warm) and its peak alpha at the pool's centre. */
export const SHADE_TINT = 0x1a0b07;
export const SHADE_ALPHA = 0.85;
export const MAX_SHADES = 8;
const KEY = 'fire-lane-shade';

export interface ShadeRect {
  readonly cx: number;
  readonly cy: number;
  readonly w: number;
  readonly h: number;
}

/** The pool for a fighter's visual box (x, y, w, h): wider than the body, centred a little below its middle, so it reads as cast on the floor. Pure. */
export function shadeRect(x: number, y: number, w: number, h: number): ShadeRect {
  return { cx: x + w / 2, cy: y + h * 0.55, w: w * 2.1, h: h * 1.3 };
}

export interface StageShade {
  /** Shows the shades of `stage` (1 fire pools, one per box in `boxes`: x, y, w, h each, `n` of them; 4 air wash), faded by `alpha`; hides the rest. */
  update(stage: number, alpha: number, highContrast: boolean, boxes: ArrayLike<number>, n: number): void;
  /** Fire pools currently visible (test probe). */
  visible(): number;
  destroy(): void;
}

function ensureTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(KEY)) return;
  const tex = scene.textures.createCanvas(KEY, 128, 128);
  const ctx = tex?.getContext();
  if (!tex || !ctx) return;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.55, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  tex.refresh();
}

/** `w` x `h` is the arena, `airDepth` the depth of the air wash. */
export function mountStageShade(scene: Phaser.Scene, w: number, h: number, airDepth: number): StageShade {
  let pool: Phaser.GameObjects.Image[] = [];
  let air: Phaser.GameObjects.Rectangle | undefined;
  let shown = 0;
  return {
    update(stage, alpha, highContrast, boxes, n): void {
      if (stage === 4 && !air) air = scene.add.rectangle(0, 0, w, h, 0x2a3a66, 0.2).setOrigin(0, 0).setDepth(airDepth);
      air?.setVisible(stage === 4).setAlpha(alpha);
      const on = stage === 1 && !highContrast;
      if (on && pool.length === 0) {
        ensureTexture(scene);
        pool = Array.from({ length: MAX_SHADES }, () => scene.add.image(0, 0, KEY).setTint(SHADE_TINT).setDepth(SHADE_DEPTH).setVisible(false));
      }
      shown = 0;
      pool.forEach((img, i) => {
        if (!on || i >= n) return void img.setVisible(false);
        const r = shadeRect(boxes[i * 4] ?? 0, boxes[i * 4 + 1] ?? 0, boxes[i * 4 + 2] ?? 0, boxes[i * 4 + 3] ?? 0);
        img.setVisible(true).setAlpha(SHADE_ALPHA * alpha).setPosition(r.cx, r.cy).setDisplaySize(r.w, r.h);
        shown++;
      });
    },
    visible: () => shown,
    destroy(): void {
      for (const s of pool) s.destroy();
      air?.destroy();
      pool = [];
      air = undefined;
    },
  };
}
