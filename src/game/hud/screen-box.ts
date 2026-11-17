import type Phaser from 'phaser';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH, resolutionOf, viewHeight } from '../boot/viewport';

/**
 * The central 1280x720 screen box in world px right now, read from the live main camera (Arcade pan, zoom and any cinematic
 * zoom), so screen-space layers in the Arena scene (action bar, swap notice) stay fixed on screen: logical (sx, sy) goes to
 * `x + sx * scale, y + sy * scale`. With the wide view the canvas is wider than the box and the box sits in its middle; a tall view (portrait play) keeps it at the bottom.
 * Classic never calls this (its camera is the fixed fit camera).
 */
export function screenBox(scene: Phaser.Scene): { x: number; y: number; scale: number } {
  const cam = scene.cameras.main;
  const world = 1 / cam.zoom;
  const res = resolutionOf(scene);
  // The 1280x720 box sits at the BOTTOM of a tall view (portrait play): its top is 720 logical px above the view's bottom edge. Same as centring at 720.
  const half = (viewHeight(scene) * res * world) / 2;
  return {
    x: cam.scrollX + cam.width / 2 - (LOGICAL_WIDTH * res * world) / 2,
    y: cam.scrollY + cam.height / 2 + half - LOGICAL_HEIGHT * res * world,
    scale: res * world,
  };
}
