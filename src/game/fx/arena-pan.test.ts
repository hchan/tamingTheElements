import { describe, expect, it } from 'vitest';
import type Phaser from 'phaser';
import { applyCamera, holdCamera, panFraming, viewBox } from './arena-pan';

function fakeScene(width = 1280): { scene: Phaser.Scene; cam: { zoom: number; cx: number; cy: number } } {
  const cam = { zoom: 0, cx: 0, cy: 0 };
  const main = {
    setZoom(z: number) { cam.zoom = z; return main; },
    centerOn(x: number, y: number) { cam.cx = x; cam.cy = y; return main; },
  };
  return { scene: { scale: { width }, cameras: { main } } as unknown as Phaser.Scene, cam };
}

describe('arena pan camera glue', () => {
  it('starts pinned at the fit camera: centre 640, zoom 1', () => {
    const { scene, cam } = fakeScene();
    expect(panFraming(scene)).toEqual({ centerX: 640, zoom: 1 });
    applyCamera(scene);
    expect(cam).toEqual({ zoom: 1, cx: 640, cy: 360 });
  });

  it('multiplies by the render resolution', () => {
    const { scene, cam } = fakeScene(2560);
    applyCamera(scene);
    expect(cam.zoom).toBe(2);
  });

  it('a super zoom about a point keeps that point on screen (same maths as the old fit camera when pinned)', () => {
    const { scene, cam } = fakeScene();
    applyCamera(scene, 2, 300, 500);
    expect(cam).toEqual({ zoom: 2, cx: 300 + (640 - 300) / 2, cy: 500 + (360 - 500) / 2 });
  });

  it('viewBox is the identity at zoom 1 and shrinks with the super zoom', () => {
    const { scene } = fakeScene();
    expect(viewBox(scene)).toEqual({ x: 0, y: 0, scale: 1 });
    const v = viewBox(scene, 2, 300, 500);
    expect(v.scale).toBe(0.5);
    // The top-left of the window is half a view left of the camera centre.
    expect(v.x).toBeCloseTo(300 + 170 - 320);
    expect(v.y).toBeCloseTo(500 - 70 - 180);
  });

  it('holdCamera is a flag per scene and does not move the framing', () => {
    const { scene } = fakeScene();
    holdCamera(scene, true);
    expect(panFraming(scene)).toEqual({ centerX: 640, zoom: 1 });
  });
});
