/**
 * Pure rules for the round-start name cards and the KO banner's weight (SF / MvC feel; no Phaser, view only). The cards
 * fill the sim's intro (ROUND_INTRO_TICKS) instead of leaving it as a dead wait: each side's hero name slides in from
 * its edge, holds, and clears before "FIGHT!". The KO banner draws larger than other banners. Times are view ticks.
 */

/** The intro banners that carry the cards ("ROUND 2", "FINAL ROUND", "SUDDEN DEATH"). */
export function isIntroBanner(main: string): boolean {
  return main.startsWith('ROUND ') || main === 'FINAL ROUND' || main === 'SUDDEN DEATH';
}

export const CARD_IN_TICKS = 14;
export const CARD_OUT_TICKS = 14;
/** The cards clear this many ticks before the intro banner's end, so the stage is clean when FIGHT! lands. */
export const CARD_CLEAR_TICKS = 6;
/** Slide distance in logical px (a card starts this far off its resting place, towards its own edge). */
export const CARD_SLIDE_PX = 220;

export interface CardFrame {
  /** 0 hidden .. 1 fully shown. */
  alpha: number;
  /** Horizontal offset in px towards the card's own screen edge (0 when settled). */
  offset: number;
}

/**
 * The card `age` view ticks after the intro banner appeared, with `total` ticks of intro. Ease-out slide in, hold, fade
 * out. Reduced motion keeps the name on screen but drops the slide (a plain fade in and out).
 */
export function cardFrame(age: number, total: number, reduced: boolean, out: CardFrame): CardFrame {
  const end = total - CARD_CLEAR_TICKS;
  const inK = Math.min(1, Math.max(0, age / CARD_IN_TICKS));
  const outK = Math.min(1, Math.max(0, (end - age) / CARD_OUT_TICKS));
  out.alpha = age < 0 || age >= end ? 0 : Math.min(inK, outK);
  out.offset = reduced ? 0 : CARD_SLIDE_PX * (1 - inK) * (1 - inK);
  return out;
}

/** Banner size multiplier: "K.O." and its double fill the screen centre; FIGHT! is larger; the rest keep the base size. */
export function bannerSizeFor(main: string): number {
  return main === 'K.O.' || main === 'DOUBLE K.O.' ? 2.2 : main === 'FIGHT!' ? 1.4 : 1;
}

/** Warm luminous white for the big calls, the usual bone for the rest. */
export function bannerColorFor(main: string): string {
  return main === 'K.O.' || main === 'DOUBLE K.O.' ? '#fff1c8' : main === 'FIGHT!' ? '#ffe9b0' : '#b3ab9a';
}

/** Radial halo strength behind a banner at `age` ticks: peaks at once and decays; none for ordinary banners or reduced motion. */
export function haloFor(main: string, age: number, reduced: boolean): number {
  if (reduced || age < 0 || bannerSizeFor(main) <= 1) return 0;
  return Math.max(0, 1 - age / 40) * 0.55;
}
