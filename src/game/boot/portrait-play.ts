import type Phaser from 'phaser';

/** Portrait phones and small tablets (the rotate hint's query). */
export const PORTRAIT_QUERY = '(orientation: portrait) and (max-width: 900px)';
/** Portrait play layout: touch devices only (a narrow desktop window keeps the centred canvas). */
export const PORTRAIT_PLAY_QUERY = `${PORTRAIT_QUERY} and (pointer: coarse)`;
/** Game registry key: true while the portrait play layout is active (`html[data-portrait-play]` is set). */
export const PORTRAIT_PLAY = 'tte:portraitPlay';
/** CSS px of the top strip above the pinned canvas (Pause, fullscreen, Tour chip live in it). */
export const PORTRAIT_TOP_STRIP = 52;
/** CSS px by which a touch button extends ABOVE its drawn box (over the arena floor, invisible) in the portrait play layout: the 44 px tap height of the one-row bar. */
export const PORTRAIT_BAR_EXT = 44;

/** CSS px of the control deck under the tall canvas (action bar, skirts, stick, strikes): the canvas ends this far above the viewport bottom. */
export const PORTRAIT_DECK = 156;
/** CSS px under the top strip that the HUD (health bars, chips) occupies; the first-run card starts below it. */
export const PORTRAIT_HUD_BAND = 70;

/**
 * Deck height for the viewport `vh` when the stick and strike buttons start at `stickTop` / `strikesTop` (viewport y, CSS px):
 * never under 156, and tall enough that the buttons plus an 8 px gap stay below the canvas, so an iPhone safe-area inset that lifts
 * the stick does not push it into the action bar (its 44 px tap extension now reaches up into the arena, not down into the deck). Pure, for tests.
 */
export function deckFor(vh: number, stickTop: number, strikesTop: number): number {
  const top = Math.min(stickTop, strikesTop);
  if (!Number.isFinite(top) || !Number.isFinite(vh)) return PORTRAIT_DECK;
  return Math.max(PORTRAIT_DECK, Math.ceil(vh - top + 8));
}

/** The slice of the canvas parent element the deck measurement reads. */
interface ParentBox {
  getBoundingClientRect(): { top: number; bottom: number; height: number };
  ownerDocument: { getElementById(id: string): { getBoundingClientRect(): { top: number; height: number } } | null };
}

/**
 * Measures the deck of the live page: `deckFor` over the parent box's bottom and the tops of the touch stick and strikes (DOM
 * reads; a missing or hidden control counts as absent, giving the 200 px floor).
 */
export function measureDeck(game: Phaser.Game): number {
  const parent = game.scale.parent as unknown as ParentBox | null | undefined;
  if (!parent || typeof parent.getBoundingClientRect !== 'function') return PORTRAIT_DECK;
  const top = (id: string): number => {
    const r = parent.ownerDocument.getElementById(id)?.getBoundingClientRect();
    return r && r.height > 0 ? r.top : Number.POSITIVE_INFINITY;
  };
  const stick = top('touchStick');
  const strikes = top('touchStrikes');
  if (stick === Number.POSITIVE_INFINITY && strikes === Number.POSITIVE_INFINITY) return PORTRAIT_DECK;
  return deckFor(parent.getBoundingClientRect().bottom, stick, strikes);
}

const barTops = new WeakMap<object, number>();

/** The action bar records its panel's top edge (in its own 1280x720 box) so the arena camera can frame the floor above it. */
export function setPanelTop(scene: object, top: number): void {
  barTops.set(scene, top);
}

/** The recorded panel top, or `fallback` (the one-row bar's) before the bar has drawn. */
export function panelTopOf(scene: object, fallback: number): number {
  return barTops.get(scene) ?? fallback;
}

/** Share of the free height (HUD band to bar top, in view px) the floor's bottom edge is lifted above the bar: crops the empty sky (QA r103 P2). */
export const PORTRAIT_FLOOR_LIFT = 0.3;

/**
 * Where the arena floor's bottom edge (world y 720) lands, in the 720-box coordinates of `panelTopOf`: above the bar by a share of
 * the free height, the ground mirror filling the gap, so the camera looks lower and the sky above is cropped. Camera framing only.
 */
export function floorBottomOf(scene: object, fallback: number, viewH: number): number {
  const top = panelTopOf(scene, fallback);
  const free = viewH - 720 + top - PORTRAIT_HUD_BAND; // the free height in view px (the 720 box sits at the view's bottom)
  return top - Math.round(PORTRAIT_FLOOR_LIFT * Math.max(0, free));
}

export function isPortraitPlay(game: Phaser.Game): boolean {
  return game.registry.get(PORTRAIT_PLAY) === true;
}
