import type Phaser from 'phaser';
import { crisp } from '../boot/viewport';

/** Mutable per-frame HUD state shared by reference between the `Hud` scene and its view helpers (which never import the scene). */
export interface HudFlags {
  /** High-contrast palette (accessibility pref). */
  highContrast: boolean;
  /** Reduced motion (accessibility pref): steady glows, no pulses. */
  reduceMotion: boolean;
  /** Last frame's delta in ms. */
  frameMs: number;
  /** Frames drawn since the scene started. */
  frame: number;
  /** An Arcade match (slim HUD) rather than the Classic plates. */
  arcade: boolean;
}

export const newHudFlags = (): HudFlags => ({ highContrast: false, reduceMotion: false, frameMs: 1000 / 60, frame: 0, arcade: false });

/** The same already-installed engraved serif the action bar, timer and banners use (no new font files). */
export const HUD_FONT = 'Georgia, "Times New Roman", serif';

/** A pooled HUD text (depth 102, 3 px outline) of the given size. */
export function hudText(scene: Phaser.Scene, size: number): Phaser.GameObjects.Text {
  const style = { fontFamily: HUD_FONT, fontSize: `${String(size)}px`, color: '#e0d8c6', fontStyle: 'bold', stroke: '#0a0806', strokeThickness: 3 };
  return scene.add.text(0, 0, '', crisp(scene, style)).setDepth(102);
}
