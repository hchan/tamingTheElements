import type Phaser from 'phaser';
import { describe, expect, it } from 'vitest';
import { MIN_BOLT_LONG_SIDE, ProjectileView, SPRITE_BOOST, boltDisplaySize, lookup, snagSpriteFor } from './projectile-view';

/** Chainable fake Image that really stores alpha, so the test sees what the pose layer would multiply. */
interface FakeImage { alpha: number; [method: string]: unknown }
function fakeImage(): FakeImage {
  const img: FakeImage = { alpha: 1 };
  img.setAlpha = (a: number) => { img.alpha = a; return img; };
  for (const m of ['setOrigin', 'setVisible', 'setDisplaySize', 'setFlipX', 'setPosition', 'setAngle', 'setDepth', 'setBlendMode', 'setTint', 'setTexture', 'destroy']) {
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

describe('boltDisplaySize', () => {
  it('enlarges a tiny fireball (25x12 box, 80x50 art) keeping the art aspect', () => {
    const s = boltDisplaySize(25, 12, 80, 50);
    expect(s.w).toBeGreaterThanOrEqual(MIN_BOLT_LONG_SIDE);
    expect(s.w / s.h).toBeCloseTo(80 / 50, 5);
  });
  it('never draws smaller than the box length and keeps the aspect for a wide box (fire blast 75x15, art 74x26)', () => {
    const s = boltDisplaySize(75, 15, 74, 26);
    expect(s.w).toBeGreaterThanOrEqual(75);
    expect(s.w / s.h).toBeCloseTo(74 / 26, 5);
  });
  it('thickens a thin bolt only up to 1.5x (shards of ice 40x10, art 80x11)', () => {
    const s = boltDisplaySize(40, 10, 80, 11);
    expect(s.w / s.h).toBeCloseTo(80 / 11, 5);
    expect(s.w).toBeLessThanOrEqual(MIN_BOLT_LONG_SIDE * 1.5 + 1e-9);
  });
  it('falls back to the box when the art size is unknown', () => {
    expect(boltDisplaySize(20, 10, 0, 0)).toEqual({ w: 20, h: 10 });
  });
});

describe('Snag rope art by caster element', () => {
  it('uses the water and air cords for those casters and keeps the green vine for everyone else', () => {
    expect(snagSpriteFor('entanglingVines', 'water')).toBe('entanglingVinesWater');
    expect(snagSpriteFor('entanglingVines', 'air')).toBe('entanglingVinesAir');
    for (const e of ['earth', 'fire', 'nature', 'void', undefined]) expect(snagSpriteFor('entanglingVines', e)).toBe('entanglingVines');
    expect(snagSpriteFor('iceShock', 'water')).toBe('iceShock');
  });
  it('has a manifest entry for each variant, same size as the vine', () => {
    const vine = lookup('entanglingVines')?.entry.coords;
    for (const k of ['entanglingVinesWater', 'entanglingVinesAir']) expect(lookup(k)?.entry.coords).toEqual(vine);
  });
  it('swaps the pooled view texture when the caster element changes', () => {
    const tex: string[] = [];
    const scene = {
      add: { image: () => { const i = fakeImage(); i.setTexture = (k: string) => { tex.push(k); return i; }; return i; } },
      textures: { get: () => ({ has: () => true, add: () => undefined }) },
    } as unknown as Phaser.Scene;
    const view = new ProjectileView(scene);
    const p = { id: 1, team: 0, sprite: 'entanglingVines', dir: 0, x: 0, y: 0, px: 0, py: 0, w: 200, h: 40 };
    view.apply(p, 1, true, 'water');
    expect(tex).toContain('sprite:entanglingVinesWater');
    view.apply(p, 1, true, 'earth');
    expect(tex.at(-1)).toBe('sprite:entanglingVines');
  });
});

describe("SPRITE_BOOST contrast entries (ability audit open defects)", () => {
  it("keeps Stick readable on bright floors: bigger, dark normal-blend outline; others stay additive", () => {
    const blends: number[] = [];
    const scene = {
      add: { image: () => { const i = fakeImage(); i.setBlendMode = (b: number) => { blends.push(b); return i; }; return i; } },
      textures: { get: () => ({ has: () => true }) },
    } as unknown as Phaser.Scene;
    const view = new ProjectileView(scene);
    blends.length = 0;
    view.apply({ id: 1, team: 0, sprite: "stick", dir: 0, x: 0, y: 0, px: 0, py: 0, w: 25, h: 10 }, 1);
    expect(blends.at(-1)).toBe(0);
    expect(SPRITE_BOOST["stick"]?.minLong).toBeGreaterThanOrEqual(56);
    view.apply({ id: 2, team: 0, sprite: "fireball", dir: 0, x: 0, y: 0, px: 0, py: 0, w: 25, h: 12 }, 1);
    expect(blends.at(-1)).toBe(1);
  });
  it("draws Crimson Fire and Strangling Branches with a strong halo and longer or thicker art", () => {
    for (const k of ["crimsonFire", "stranglingBranches"]) expect(SPRITE_BOOST[k]?.glowAlpha).toBeGreaterThanOrEqual(0.9);
    expect(SPRITE_BOOST["crimsonFire"]?.minLong).toBeGreaterThan(80);
  });
  it("lifts the dark void sprites with a pale halo", () => {
    for (const k of ["chaosBolt", "chaosOrb"]) expect(SPRITE_BOOST[k]?.glowAlpha).toBeGreaterThanOrEqual(0.8);
  });
});
