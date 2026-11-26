import type Phaser from 'phaser';
import { describe, expect, it } from 'vitest';
import { mountStageShade, SHADE_ALPHA, shadeRect } from './stage-shade';

describe('stage-shade helpers', () => {
  it('centres the pool on the body, wider than it, and low enough to read as cast on the floor', () => {
    const r = shadeRect(100, 200, 80, 120);
    expect(r.cx).toBe(140);
    expect(r.w).toBeGreaterThan(80);
    expect(r.cy).toBeGreaterThan(200 + 60);
    expect(r.cy).toBeLessThan(200 + 120);
  });
});

interface Made {
  visible: boolean;
  alpha: number;
}

/** A scene stub that records the images and rectangles it creates (no Phaser, no DOM). */
function fakeScene(): { scene: Phaser.Scene; made: Made[] } {
  const made: Made[] = [];
  const mk = (): unknown => {
    const o: Made = { visible: false, alpha: 1 };
    made.push(o);
    const self: Record<string, unknown> = {};
    for (const k of ['setTint', 'setDepth', 'setOrigin', 'setPosition', 'setDisplaySize']) self[k] = () => self;
    self.setVisible = (v: boolean) => ((o.visible = v), self);
    self.setAlpha = (a: number) => ((o.alpha = a), self);
    self.destroy = () => undefined;
    return self;
  };
  const scene = { textures: { exists: () => true }, add: { image: mk, rectangle: mk } };
  return { scene: scene as unknown as Phaser.Scene, made };
}

describe('mountStageShade', () => {
  const boxes = [10, 20, 60, 100, 300, 20, 60, 100];
  it('draws one dark pool per fighter on the Fire stage only', () => {
    const { scene, made } = fakeScene();
    const s = mountStageShade(scene, 1280, 720, 1);
    s.update(1, 1, false, boxes, 2);
    expect(s.visible()).toBe(2);
    expect(made.filter((m) => m.visible)).toHaveLength(2);
    expect(made[0]?.alpha).toBeCloseTo(SHADE_ALPHA);
    s.update(2, 1, false, boxes, 2);
    expect(s.visible()).toBe(0);
  });
  it('hides the pools under high contrast', () => {
    const { scene } = fakeScene();
    const s = mountStageShade(scene, 1280, 720, 1);
    s.update(1, 1, true, boxes, 2);
    expect(s.visible()).toBe(0);
  });
});
