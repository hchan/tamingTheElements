import Phaser from 'phaser';
import { Boot } from '../scenes/Boot';
import { Arena, ARENA_SCENE } from '../scenes/Arena';
import { Cinematic, CINEMATIC_SCENE, type CinematicLaunch } from '../scenes/Cinematic';
import { Hud } from '../scenes/Hud';
import type { ArenaLaunch } from '../scenes/launch';
import { Preload, PRELOAD_READY } from '../scenes/Preload';
import { installPresentation } from './presentation';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH, pickResolution } from './viewport';

export { LOGICAL_HEIGHT, LOGICAL_WIDTH } from './viewport';

/**
 * Phaser 4 config: WebGL only, no physics, no template telemetry. The backing store is the logical
 * 1280x720 times an integer resolution (device pixel ratio, capped; see viewport.ts) and scenes zoom
 * their camera to match, so the canvas is sharp on high-DPI screens while the sim stays 1280x720.
 *
 * Scale.FIT, not ENVELOP: FIT letterboxes, so the whole arena, HUD and action bar are always visible
 * with the 16:9 aspect preserved; ENVELOP would crop the edges (action bar, HUD) on any non-16:9 window.
 */
export function createGameConfig(parent: string, resolution: number = pickResolution(window.devicePixelRatio)): Phaser.Types.Core.GameConfig {
  return {
    type: Phaser.WEBGL,
    width: LOGICAL_WIDTH * resolution,
    height: LOGICAL_HEIGHT * resolution,
    parent,
    roundPixels: false, // art is not pixel art (ADR-0006)
    disableContextMenu: true,
    banner: false,
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: [Boot, Preload, Arena, Hud, Cinematic],
  };
}

/**
 * Jumps from Preload into the Arena. `arena` is launch data from the app flow (a real match), or `true`
 * for the flag-gated bot-vs-bot demo; `false` stays on Preload.
 */
export function createGame(
  parent: string,
  arena: ArenaLaunch | boolean = false,
  cinematic: CinematicLaunch | boolean = false,
): Phaser.Game {
  const game = new Phaser.Game(createGameConfig(parent));
  const host = document.getElementById(parent);
  if (host) installPresentation(game, host, { rotateHint: arena !== false && !cinematic });
  if (arena !== false || cinematic) {
    game.events.once(PRELOAD_READY, () => {
      game.scene.stop('Preload');
      if (cinematic) game.scene.start(CINEMATIC_SCENE, cinematic === true ? undefined : cinematic);
      else game.scene.start(ARENA_SCENE, arena === true || arena === false ? undefined : arena);
    });
  }
  return game;
}
