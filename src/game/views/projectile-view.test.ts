import type Phaser from 'phaser';
import { describe, expect, it } from 'vitest';
import { LOOP_FPS, MIN_BOLT_LONG_SIDE, ProjectileView, SPRITE_BOOST, boltDisplaySize, loopFrameAt, lookup, snagSpriteFor } from './projectile-view';

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

describe('ProjectileView Fire Blast falloff (FUN-DESIGN 2.27)', () => {
  const base = { id: 1, team: 0, sprite: 'fireBlast', dir: 0, x: 100, y: 100, px: 100, py: 100, w: 115, h: 55 };
  function setup(): { view: ProjectileView; sizes: number[][] } {
    const sizes: number[][] = [];
    const scene = {
      add: { image: () => { const i = fakeImage(); i.setDisplaySize = (w: number, h: number) => { sizes.push([w, h]); return i; }; return i; } },
      textures: { get: () => ({ has: () => true, add: () => undefined }), exists: () => false },
      time: { now: 0 },
    } as unknown as Phaser.Scene;
    return { view: new ProjectileView(scene), sizes };
  }
  it('fades image and glow with alphaPm, and an absent alphaPm leaves them at full', () => {
    const { view } = setup();
    view.apply({ ...base, alphaPm: 500 }, 1);
    expect(view.image.alpha).toBe(0.5);
    expect(view.glow.alpha).toBeCloseTo(0.25, 9);
    view.apply(base, 1);
    expect(view.image.alpha).toBe(1);
  });
  it('draws the art from the box minus growPx, then adds it back, so the art grows with the box', () => {
    const { view, sizes } = setup();
    view.apply({ ...base, w: 75, h: 15 }, 1);
    view.apply({ ...base, growPx: 40 }, 1);
    const [fresh, grown] = [sizes[0] ?? [0, 0], sizes[2] ?? [0, 0]];
    expect(grown[0]).toBeCloseTo((fresh[0] ?? 0) + 40, 9);
    expect(grown[1]).toBeCloseTo((fresh[1] ?? 0) + 40, 9);
  });
  it('a melee box ignores both fields', () => {
    const { view } = setup();
    view.apply({ ...base, alphaPm: 400, growPx: 30 }, 1, true);
    expect(view.image.alpha).toBe(1);
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
      textures: { get: () => ({ has: () => true }), exists: () => false },
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

describe('Curomo ability visibility boosts', () => {
  it('gives Shards of Ice a wider, brighter, icy halo and a longer minimum draw', () => {
    const b = SPRITE_BOOST['shardsOfIce'];
    expect(b?.minLong).toBeGreaterThan(MIN_BOLT_LONG_SIDE);
    expect(b?.glowAlpha).toBeGreaterThanOrEqual(0.8);
    expect(b?.glowScale).toBeGreaterThanOrEqual(2);
    expect(boltDisplaySize(40, 10, 80, 11, b?.minLong).w).toBeGreaterThanOrEqual(64);
  });
  it('lifts the Ice Shock lance halo above the default melee glow (0.2)', () => {
    expect(SPRITE_BOOST['iceShock']?.glowAlpha).toBeGreaterThan(0.2);
    expect(SPRITE_BOOST['iceShock']?.dark).toBeUndefined();
  });
});

describe('ProjectileView ability smoothing (optional clock, shift, reduced)', () => {
  function setup(): { view: ProjectileView; pos: number[][]; sizes: number[][]; angles: number[] } {
    const pos: number[][] = [];
    const sizes: number[][] = [];
    const angles: number[] = [];
    const scene = {
      add: {
        image: () => {
          const i = fakeImage();
          i.setPosition = (x: number, y: number) => { pos.push([x, y]); return i; };
          i.setDisplaySize = (w: number, h: number) => { sizes.push([w, h]); return i; };
          i.setAngle = (a: number) => { angles.push(a); return i; };
          return i;
        },
      },
      textures: { get: () => ({ has: () => true, add: () => undefined }), exists: () => false },
      time: { now: 0 },
    } as unknown as Phaser.Scene;
    return { view: new ProjectileView(scene), pos, sizes, angles };
  }
  const box = (sprite: string, id = 1) => ({ id, team: 0, sprite, dir: 0, x: 100, y: 50, px: 0, py: 0, w: 100, h: 40 });
  // Each apply sets the image display size first, then the glow's: the image is the second-to-last entry.
  const imageSize = (s: number[][]): number[] => s[s.length - 2] ?? [];

  it('shock: grows in from >= 0.8 of the box and reaches full size within 40 ms', () => {
    const { view, sizes } = setup();
    view.apply(box('groundShock'), 1, true, undefined, { tick: 10, alpha: 0 });
    expect(imageSize(sizes)[0]).toBeGreaterThanOrEqual(80 - 1e-9);
    expect(view.image.alpha).toBeCloseTo(0.6, 9);
    view.apply(box('groundShock'), 1, true, undefined, { tick: 12, alpha: 0 }); // 40 ms
    expect(imageSize(sizes)[0]).toBeCloseTo(100, 6);
    expect(view.image.alpha).toBeCloseTo(1, 9);
  });
  it('shock: fades out over the remaining time', () => {
    const { view } = setup();
    view.apply(box('groundShock'), 1, true, undefined, { tick: 10, alpha: 0, remainingMs: 30 });
    view.apply(box('groundShock'), 1, true, undefined, { tick: 20, alpha: 0, remainingMs: 30 });
    expect(view.image.alpha).toBeCloseTo(0.5, 9);
    view.apply(box('groundShock'), 1, true, undefined, { tick: 21, alpha: 0, remainingMs: 0 });
    expect(view.image.alpha).toBe(0);
  });
  it('shock: age restarts when the id changes (pooled view)', () => {
    const { view, sizes } = setup();
    view.apply(box('groundShock', 1), 1, true, undefined, { tick: 10, alpha: 0 });
    view.apply(box('groundShock', 2), 1, true, undefined, { tick: 50, alpha: 0.5 });
    expect(imageSize(sizes)[0]).toBeGreaterThanOrEqual(80 - 1e-9);
    expect(view.image.alpha).toBeCloseTo(0.6, 9);
  });
  it('shock reduced: no scale change, only a short alpha fade in', () => {
    const { view, sizes } = setup();
    view.apply(box('groundShock'), 1, true, undefined, { tick: 10, alpha: 0 }, undefined, true);
    expect(imageSize(sizes)[0]).toBe(100);
    expect(view.image.alpha).toBe(0);
    view.apply(box('groundShock'), 1, true, undefined, { tick: 30, alpha: 0 }, undefined, true);
    expect(view.image.alpha).toBe(1);
  });
  it('shift moves lunge and spin boxes only', () => {
    for (const [sprite, moved] of [['tuskGore', true], ['hurricane', true], ['groundShock', false], ['iceShock', false], ['fireball', false]] as const) {
      const { view, pos } = setup();
      view.apply(box(sprite), 1, true, undefined, { tick: 1, alpha: 0 }, { dx: 7, dy: -3 });
      expect(pos[0], sprite).toEqual(moved ? [157, 67] : [150, 70]);
    }
  });
  it('shift is ignored for a non-melee projectile', () => {
    const { view, pos } = setup();
    view.apply({ ...box('tuskGore'), px: 100, py: 50 }, 1, false, undefined, undefined, { dx: 7, dy: 7 });
    expect(pos[0]).toEqual([150, 70]);
  });
  it('hurricane spins continuously with the age and pulses; reduced neither spins nor pulses', () => {
    const { view, angles, sizes } = setup();
    view.apply(box('hurricane'), 1, true, undefined, { tick: 0, alpha: 0 });
    view.apply(box('hurricane'), 1, true, undefined, { tick: 5, alpha: 0 }); // 100 ms
    expect(angles[angles.length - 2]).toBeCloseTo((0.012 * 100 * 180) / Math.PI, 6);
    view.apply(box('hurricane'), 1, true, undefined, { tick: 4, alpha: 0 }); // 80 ms: pulse peak
    expect(imageSize(sizes)[0]).toBeCloseTo(106, 6);
    const r = setup();
    r.view.apply(box('hurricane'), 1, true, undefined, { tick: 0, alpha: 0 }, undefined, true);
    r.view.apply(box('hurricane'), 1, true, undefined, { tick: 4, alpha: 0 }, undefined, true);
    expect(r.angles[r.angles.length - 2]).toBe(0);
    expect(imageSize(r.sizes)[0]).toBe(100);
  });
  it('with the new parameters omitted the drawing is unchanged', () => {
    const { view, pos, sizes, angles } = setup();
    view.apply(box('groundShock'), 1, true);
    view.apply(box('hurricane'), 1, true);
    expect(sizes.filter((_, i) => i % 2 === 0).map((s) => s[0])).toEqual([100, 100]);
    expect(pos[0]).toEqual([150, 70]);
    expect(angles.every((a) => a === 0)).toBe(true);
    expect(view.image.alpha).toBe(1);
  });
});

describe('loopFrameAt', () => {
  it('cycles all frames by age and stays on frame 0 for a static (reduced-motion) clock', () => {
    const seen = new Set([0, 1, 2, 3, 4, 5, 6, 7].map((i) => loopFrameAt((i + 0.5) * (1000 / LOOP_FPS), 8)));
    expect(seen.size).toBe(8);
    expect(loopFrameAt(0, 8)).toBe(0);
    expect(loopFrameAt(5000, 0)).toBe(0);
  });
});
