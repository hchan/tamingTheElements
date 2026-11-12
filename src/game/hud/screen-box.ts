import type Phaser from 'phaser';
import { LOGICAL_WIDTH } from '../boot/viewport';

/**
 * The 1280x720 screen in world px right now, read from the live main camera (Arcade pan, zoom and any cinematic zoom), so
 * screen-space layers in the Arena scene (action bar, swap notice) stay fixed on screen: logical (sx, sy) goes to
 * `x + sx * scale, y + sy * scale`. Classic never calls this (its camera is the fixed fit camera).
 */
export function screenBox(scene: Phaser.Scene): { x: number; y: number; scale: number } {
  const cam = scene.cameras.main;
  const world = 1 / cam.zoom;
  return {
    x: cam.scrollX + cam.width / 2 - (cam.width * world) / 2,
    y: cam.scrollY + cam.height / 2 - (cam.height * world) / 2,
    scale: (scene.scale.width / LOGICAL_WIDTH) * world,
  };
}
