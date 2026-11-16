import type Phaser from 'phaser';

/** Portrait phones and small tablets (the rotate hint's query). */
export const PORTRAIT_QUERY = '(orientation: portrait) and (max-width: 900px)';
/** Portrait play layout: touch devices only (a narrow desktop window keeps the centred canvas). */
export const PORTRAIT_PLAY_QUERY = `${PORTRAIT_QUERY} and (pointer: coarse)`;
/** Game registry key: true while the portrait play layout is active (`html[data-portrait-play]` is set). */
export const PORTRAIT_PLAY = 'tte:portraitPlay';
/** CSS px of the top strip above the pinned canvas (Pause, fullscreen, Tour chip live in it). */
export const PORTRAIT_TOP_STRIP = 52;
/** CSS px by which a touch button may extend below the canvas in the portrait play layout. */
export const PORTRAIT_BAR_EXT = 44;

export function isPortraitPlay(game: Phaser.Game): boolean {
  return game.registry.get(PORTRAIT_PLAY) === true;
}
