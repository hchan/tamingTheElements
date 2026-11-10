import Phaser from 'phaser';
import { Boot } from '../scenes/Boot';
import { Arena, ARENA_SCENE } from '../scenes/Arena';
import { Hud } from '../scenes/Hud';
import type { ArenaLaunch } from '../scenes/launch';
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
    scene: [Boot, Preload, Arena, Hud],
  };
}

/**
 * Jumps from Preload into the Arena. `arena` is launch data from the app flow (a real match), or `true`
 * for the flag-gated bot-vs-bot demo; `false` stays on Preload.
 */
export function createGame(parent: string, arena: ArenaLaunch | boolean = false): Phaser.Game {
  const game = new Phaser.Game(createGameConfig(parent));
  if (arena !== false) {
    game.events.once(PRELOAD_READY, () => {
      game.scene.stop('Preload');
      game.scene.start(ARENA_SCENE, arena === true ? undefined : arena);
    });
  }
  return game;
}
