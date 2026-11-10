import Phaser from 'phaser';
import { Boot } from '../scenes/Boot';
import { Preload } from '../scenes/Preload';

export const LOGICAL_WIDTH = 1280;
export const LOGICAL_HEIGHT = 720;

/** Phaser 4 config: WebGL only, fixed 1280x720 logical size scaled to fit, no physics, no template telemetry. */
export function createGameConfig(parent: string): Phaser.Types.Core.GameConfig {
  return {
    type: Phaser.WEBGL,
    width: LOGICAL_WIDTH,
    height: LOGICAL_HEIGHT,
    parent,
    roundPixels: false, // art is not pixel art (ADR-0006)
    disableContextMenu: true,
    banner: false,
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: [Boot, Preload],
  };
}

export function createGame(parent: string): Phaser.Game {
  return new Phaser.Game(createGameConfig(parent));
}
