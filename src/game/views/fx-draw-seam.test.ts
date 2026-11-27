import type Phaser from 'phaser';
import { describe, expect, it } from 'vitest';
import { ProjectileView } from './projectile-view';

interface FakeImage { alpha: number; [method: string]: unknown }
function fakeImage(): FakeImage {
  const img: FakeImage = { alpha: 1 };
  img.setAlpha = (a: number) => { img.alpha = a; return img; };
  for (const m of ['setOrigin', 'setVisible', 'setDisplaySize', 'setFlipX', 'setPosition', 'setAngle', 'setDepth', 'setBlendMode', 'setTint', 'setTexture', 'destroy']) img[m] = () => img;
  return img;
}

describe('fx draw tweaks seam in ProjectileView (abyssFlash, emberBite untouched)', () => {
  function setup(): { view: ProjectileView; log: { size: number[][]; blend: number[] } } {
    const log = { size: [] as number[][], blend: [] as number[] };
    let n = 0;
    const scene = {
      add: { image: () => {
        const i = fakeImage();
        if (n++ === 1) { // the sprite image (the first one created is the glow)
          i.setDisplaySize = (w: number, h: number) => { log.size.push([w, h]); return i; };
          i.setBlendMode = (b: number) => { log.blend.push(b); return i; };
        }
        return i;
      } },
      textures: { get: () => ({ has: () => true }), exists: () => false },
    } as unknown as Phaser.Scene;
    return { view: new ProjectileView(scene), log };
  }
  it('draws abyssFlash 1.8x, additive, alpha 0.9, without touching the hit box', () => {
    const { view, log } = setup();
    view.apply({ id: 1, team: 0, sprite: 'abyssFlash', dir: 0, x: 0, y: 0, px: 0, py: 0, w: 100, h: 100 }, 1, true);
    expect(log.size.at(-1)).toEqual([180, 180]);
    expect(log.blend.at(-1)).toBe(1);
    expect(view.image.alpha).toBeCloseTo(0.9);
  });
  it('draws emberBite and a plain melee sprite exactly as shipped (normal blend, no scale)', () => {
    const { view, log } = setup();
    view.apply({ id: 1, team: 0, sprite: 'emberBite', dir: 0, x: 0, y: 0, px: 0, py: 0, w: 48, h: 34 }, 1, true);
    expect(log.size.at(-1)).toEqual([48, 34]);
    expect(log.blend.at(-1)).toBe(0);
    view.apply({ id: 2, team: 0, sprite: 'iceShock', dir: 0, x: 0, y: 0, px: 0, py: 0, w: 100, h: 40 }, 1, true);
    expect(log.blend.at(-1)).toBe(0);
  });
});
