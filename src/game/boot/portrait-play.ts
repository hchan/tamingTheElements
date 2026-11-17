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

/** CSS px of the control deck under the tall canvas (action bar, skirts, stick, strikes): the canvas ends this far above the viewport bottom. */
export const PORTRAIT_DECK = 200;
/** CSS px under the top strip that the HUD (health bars, chips) occupies; the first-run card starts below it. */
export const PORTRAIT_HUD_BAND = 70;

/**
 * Deck height for the viewport `vh` when the stick and strike buttons start at `stickTop` / `strikesTop` (viewport y, CSS px):
 * never under 200, and tall enough that the buttons plus the bar's 44 px skirt and an 8 px gap stay below the canvas, so an
 * iPhone safe-area inset that lifts the stick does not push it into the skirts. Pure, for tests.
 */
export function deckFor(vh: number, stickTop: number, strikesTop: number): number {
  const top = Math.min(stickTop, strikesTop);
  if (!Number.isFinite(top) || !Number.isFinite(vh)) return PORTRAIT_DECK;
  return Math.max(PORTRAIT_DECK, Math.ceil(vh - top + PORTRAIT_BAR_EXT + 8));
}

export function isPortraitPlay(game: Phaser.Game): boolean {
  return game.registry.get(PORTRAIT_PLAY) === true;
}
