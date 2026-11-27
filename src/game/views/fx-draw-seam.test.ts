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

describe('fx draw tweaks seam in ProjectileView (emberBite, abyssFlash)', () => {
  function setup(): { view: ProjectileView; log: { size: number[][]; pos: number[][]; blend: number[] } } {
    const log = { size: [] as number[][], pos: [] as number[][], blend: [] as number[] };
    let n = 0;
    const scene = {
      add: { image: () => {
        const i = fakeImage();
        if (n++ === 1) { // the sprite image (the first one created is the glow)
          i.setDisplaySize = (w: number, h: number) => { log.size.push([w, h]); return i; };
          i.setPosition = (x: number, y: number) => { log.pos.push([x, y]); return i; };
          i.setBlendMode = (b: number) => { log.blend.push(b); return i; };
        }
        return i;
      } },
      textures: { get: () => ({ has: () => true }), exists: () => false },
    } as unknown as Phaser.Scene;
    return { view: new ProjectileView(scene), log };
  }
  it('draws the bite 2.1x, one body length ahead and additive, without touching the hit box', () => {
    const { view, log } = setup();
    log.blend.length = 0;
    view.apply({ id: 1, team: 0, sprite: 'emberBite', dir: 0, x: 300, y: 200, px: 0, py: 0, w: 48, h: 34 }, 1, true);
    expect(log.size.at(-1)).toEqual([48 * 2.1, 34 * 2.1]);
    expect(log.pos.at(-1)).toEqual([300 + 24 + 48, 200 + 17]);
    expect(log.blend.at(-1)).toBe(1);
    expect(view.image.alpha).toBe(1);
  });
  it('shifts a west-facing bite the other way', () => {
    const { view, log } = setup();
    view.apply({ id: 1, team: 0, sprite: 'emberBite', dir: 4, x: 300, y: 200, px: 0, py: 0, w: 48, h: 34 }, 1, true);
    expect(log.pos.at(-1)).toEqual([300 + 24 - 48, 200 + 17]);
  });
  it('draws abyssFlash 1.8x and a plain melee sprite on normal blend', () => {
    const { view, log } = setup();
    view.apply({ id: 1, team: 0, sprite: 'abyssFlash', dir: 0, x: 0, y: 0, px: 0, py: 0, w: 100, h: 100 }, 1, true);
    expect(log.size.at(-1)).toEqual([180, 180]);
    view.apply({ id: 2, team: 0, sprite: 'iceShock', dir: 0, x: 0, y: 0, px: 0, py: 0, w: 100, h: 40 }, 1, true);
    expect(log.blend.at(-1)).toBe(0);
  });
});
