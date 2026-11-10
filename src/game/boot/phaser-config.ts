import Phaser from 'phaser';
import { Boot } from '../scenes/Boot';
import { Arena, ARENA_SCENE } from '../scenes/Arena';
import { Preload, PRELOAD_READY } from '../scenes/Preload';

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
    scene: [Boot, Preload, Arena],
  };
}

/** `arenaDemo` (flag-gated, default off) jumps from Preload straight into a bot-vs-bot Arena. */
export function createGame(parent: string, arenaDemo = false): Phaser.Game {
  const game = new Phaser.Game(createGameConfig(parent));
  if (arenaDemo) {
    game.events.once(PRELOAD_READY, () => {
      game.scene.stop('Preload');
      game.scene.start(ARENA_SCENE);
    });
  }
  return game;
}
