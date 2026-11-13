import { describe, expect, it } from 'vitest';
import type Phaser from 'phaser';
import { LOGICAL_WIDTH } from '../boot/viewport';
import { screenBox } from './screen-box';

type Cam = { zoom: number; scrollX: number; scrollY: number; width: number; height: number };
const scene = (cam: Cam, width: number): Phaser.Scene =>
  ({ cameras: { main: cam }, scale: { width } }) as unknown as Phaser.Scene;

describe('screenBox', () => {
  it('is the identity at the logical size with the default camera', () => {
    expect(screenBox(scene({ zoom: 1, scrollX: 0, scrollY: 0, width: 1280, height: 720 }, LOGICAL_WIDTH))).toEqual({ x: 0, y: 0, scale: 1 });
  });

  it('scales with the canvas width', () => {
    expect(screenBox(scene({ zoom: 1, scrollX: 0, scrollY: 0, width: 640, height: 360 }, LOGICAL_WIDTH / 2)).scale).toBe(0.5);
  });

  it('follows the camera scroll when unzoomed', () => {
    expect(screenBox(scene({ zoom: 1, scrollX: 300, scrollY: 40, width: 1280, height: 720 }, LOGICAL_WIDTH))).toEqual({ x: 300, y: 40, scale: 1 });
  });

  it('zoomed in 2x the view covers half the world around the same centre, at half scale', () => {
    const b = screenBox(scene({ zoom: 2, scrollX: 100, scrollY: 50, width: 1280, height: 720 }, LOGICAL_WIDTH));
    expect(b.scale).toBe(0.5);
    expect(b.x).toBe(100 + 1280 / 4);
    expect(b.y).toBe(50 + 720 / 4);
  });

  it('zoomed out 2x the view covers twice the world, so the box starts before the scroll and is double scale', () => {
    const b = screenBox(scene({ zoom: 0.5, scrollX: -200, scrollY: -100, width: 1280, height: 720 }, LOGICAL_WIDTH));
    expect(b.scale).toBe(2);
    expect(b.x).toBe(-200 - 640);
    expect(b.y).toBe(-100 - 360);
  });
});
