import { describe, expect, it } from 'vitest';
import type Phaser from 'phaser';
import { mountStageBackdrop } from './terrain-stage';
import {
  ATLAS_H, ATLAS_W, CROWD_FACTOR, CROWD_FRAMES, FAR_FACTOR, FLY_FACTOR, atlasFrames, crowdHop, crowdIndex, flyIndex, flyOffset, layerX,
} from './terrain-stage-layout';

interface Img { frame: string; x: number; y: number; visible: boolean; destroyed: boolean }

function fakeScene(loaded: boolean): { scene: Phaser.Scene; imgs: Img[]; loads: string[]; frames: string[] } {
  const imgs: Img[] = [];
  const loads: string[] = [];
  const frames: string[] = [];
  const scene = {
    textures: { exists: () => loaded, get: () => ({ add: (n: string) => { frames.push(n); } }) },
    load: { image: (k: string) => { loads.push(k); }, start: () => undefined },
    add: {
      image: (_x: number, _y: number, _k: string, frame: string) => {
        const img: Img = { frame, x: 0, y: 0, visible: true, destroyed: false };
        imgs.push(img);
        const o = {
          setOrigin: () => o, setDepth: () => o,
          setVisible: (v: boolean) => { img.visible = v; return o; },
          setFrame: (f: string) => { img.frame = f; return o; },
          setX: (x: number) => { img.x = x; return o; },
          setY: (y: number) => { img.y = y; return o; },
          destroy: () => { img.destroyed = true; },
        };
        return o;
      },
    },
  } as unknown as Phaser.Scene;
  return { scene, imgs, loads, frames };
}

describe('stage backdrop layout', () => {
  it('atlas frames stay inside the atlas and have unique names', () => {
    const fr = atlasFrames();
    expect(fr).toHaveLength(4 * (1 + CROWD_FRAMES + 2));
    for (const f of fr) {
      expect(f.x + f.w).toBeLessThanOrEqual(ATLAS_W);
      expect(f.y + f.h).toBeLessThanOrEqual(ATLAS_H);
    }
    expect(new Set(fr.map((f) => f.name)).size).toBe(fr.length);
  });

  it('parallax: the far layer moves less than the drifters, then the crowd, which move less than the world', () => {
    // On-screen slide for a 320 px camera pan: the layer moves in the world by layerX's change, the camera by 320.
    const shift = (f: number): number => 320 - (layerX(1280, f) - layerX(960, f));
    expect(shift(FAR_FACTOR)).toBeLessThan(shift(FLY_FACTOR));
    expect(shift(FLY_FACTOR)).toBeLessThan(shift(CROWD_FACTOR));
    expect(shift(CROWD_FACTOR)).toBeLessThan(320); // the world itself slides the camera's full 320 px
    expect(layerX(960, FAR_FACTOR)).toBe(-240);
  });

  it('covers the whole view at every pan extent of the 1920 world', () => {
    for (const cx of [640, 960, 1280]) {
      for (const f of [FAR_FACTOR, FLY_FACTOR, CROWD_FACTOR]) {
        const left = layerX(cx, f);
        expect(left).toBeLessThanOrEqual(cx - 640);
        expect(left + ATLAS_W).toBeGreaterThanOrEqual(cx + 640);
      }
    }
    // Zoomed all the way out (centre 960, the whole world in view).
    expect(layerX(960, FAR_FACTOR)).toBeLessThanOrEqual(0);
    expect(layerX(960, FAR_FACTOR) + ATLAS_W).toBeGreaterThanOrEqual(1920);
  });

  it('animation: the crowd cycles and the drifters move; still holds frame 0 at fixed spots', () => {
    expect(new Set([0, 200, 400, 600].map((ms) => crowdIndex(ms, false)))).toEqual(new Set([0, 1, 2]));
    expect(flyOffset(5000, 0, false)).not.toBe(flyOffset(0, 0, false));
    for (const ms of [0, 777, 99999]) {
      expect(crowdIndex(ms, true)).toBe(0);
      expect(flyIndex(ms, 1, true)).toBe(0);
      expect(flyOffset(ms, 1, true)).toBe(flyOffset(0, 1, true));
    }
  });
});

describe('stage backdrop view (fake scene)', () => {
  it('requests the atlas and draws nothing until it is loaded', () => {
    const f = fakeScene(false);
    const b = mountStageBackdrop(f.scene, '/');
    b.update(1, 960, 0, false);
    expect(f.loads).toEqual(['stagebg']);
    expect(f.imgs).toHaveLength(0);
    expect(b.stage).toBe(0);
  });

  it('builds four images, swaps the stage, hides on stage 0 and cleans up', () => {
    const f = fakeScene(true);
    const b = mountStageBackdrop(f.scene, '/');
    b.update(2, 1280, 450, false);
    expect(f.loads).toEqual([]);
    expect(f.frames).toHaveLength(atlasFrames().length);
    expect(f.imgs).toHaveLength(4);
    expect(b.stage).toBe(2);
    expect(b.crowd).toBe(crowdIndex(450, false));
    expect(f.imgs[0]?.frame).toBe('far:2');
    expect(f.imgs[0]?.x).toBe(layerX(1280, FAR_FACTOR));
    b.update(3, 960, 0, true);
    expect(f.imgs[0]?.frame).toBe('far:3');
    expect(b.crowd).toBe(0);
    b.update(0, 960, 0, false);
    expect(f.imgs.every((i) => !i.visible)).toBe(true);
    expect(b.stage).toBe(0);
    b.destroy();
    expect(f.imgs.every((i) => i.destroyed)).toBe(true);
  });

  it('the crowd hops and cheers faster after a KO, then settles; reduced motion keeps it still', () => {
    const f = fakeScene(true);
    const b = mountStageBackdrop(f.scene, '/');
    b.update(1, 960, 1000, false);
    const rest = f.imgs[3]?.y;
    b.rouse('ko', 1000);
    b.update(1, 960, 1060, false);
    expect(f.imgs[3]?.y).toBeLessThan(rest ?? 0);
    b.rouse('hit', 1070); // a hit does not cut the KO cheer short
    b.update(1, 960, 1070, false);
    expect(crowdHop(60, 'ko', false)).toBeGreaterThan(0);
    b.update(1, 960, 1000 + 2400, false);
    expect(f.imgs[3]?.y).toBe(rest);
    b.rouse('super', 5000);
    b.update(1, 960, 5120, true);
    expect(f.imgs[3]?.y).toBe(rest);
    expect(crowdHop(100, 'hit', true)).toBe(0);
    expect(crowdIndex(110, false, true)).not.toBe(crowdIndex(110, false, false));
  });
});
