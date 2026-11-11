import type Phaser from 'phaser';
import { describe, expect, it } from 'vitest';
import { ProjectileView } from './projectile-view';

/** Chainable fake Image that really stores alpha, so the test sees what the pose layer would multiply. */
interface FakeImage { alpha: number; [method: string]: unknown }
function fakeImage(): FakeImage {
  const img: FakeImage = { alpha: 1 };
  img.setAlpha = (a: number) => { img.alpha = a; return img; };
  for (const m of ['setOrigin', 'setVisible', 'setDisplaySize', 'setFlipX', 'setPosition', 'setAngle', 'setDepth', 'setBlendMode', 'setTexture', 'destroy']) {
    img[m] = () => img;
  }
  return img;
}

describe('ProjectileView melee placement', () => {
  it('draws a melee box at its own position even though its px/py are unset', () => {
    const pos: number[][] = [];
    const scene = {
      add: {
        image: () => {
          const i = fakeImage();
          i.setPosition = (x: number, y: number) => { pos.push([x, y]); return i; };
          return i;
        },
      },
    } as unknown as Phaser.Scene;
    const view = new ProjectileView(scene);
    view.apply({ id: 1, team: 0, sprite: 'no-such-sprite', dir: 0, x: 300, y: 200, px: 0, py: 0, w: 240, h: 40 }, 0.5, true);
    expect(pos[0]).toEqual([420, 220]);
  });
});

describe('ProjectileView alpha', () => {
  it('resets image and glow alpha every frame, so a pose-layer ease-in cannot dim a pooled bolt for good', () => {
    const imgs: FakeImage[] = [];
    const scene = { add: { image: () => { const i = fakeImage(); imgs.push(i); return i; } } } as unknown as Phaser.Scene;
    const view = new ProjectileView(scene);
    const p = { id: 1, team: 0, sprite: 'no-such-sprite', dir: 0, x: 0, y: 0, px: 0, py: 0, w: 20, h: 10 };
    for (let f = 0; f < 6; f++) {
      view.apply(p, 1);
      // What the pose layer does while a projectile eases in.
      view.image.setAlpha(view.image.alpha * 0.4);
      view.glow.setAlpha(view.glow.alpha * 0.4);
    }
    view.apply(p, 1);
    expect(view.image.alpha).toBe(1);
    expect(view.glow.alpha).toBe(0.5);
  });
});
