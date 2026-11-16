/**
 * Pure rules for the round-start name cards and the KO banner's weight (SF / MvC feel; no Phaser, view only). The cards
 * fill the sim's intro (ROUND_INTRO_TICKS) instead of leaving it as a dead wait: each side's hero name slides in from
 * its edge, holds, and clears before "FIGHT!". The KO banner draws larger than other banners. Times are view ticks.
 */

/** The intro banners that carry the cards ("ROUND 2", "FINAL ROUND", "SUDDEN DEATH"). */
export function isIntroBanner(main: string): boolean {
  return main.startsWith('ROUND ') || main === 'FINAL ROUND' || main === 'SUDDEN DEATH';
}

export const CARD_IN_TICKS = 6;
export const CARD_OUT_TICKS = 14;
/** The cards clear this many ticks before the intro banner's end, so the stage is clean when FIGHT! lands. */
export const CARD_CLEAR_TICKS = 6;
/** Slide distance in logical px (a card starts this far off its resting place, towards the screen centre, never nearer its edge). */
export const CARD_SLIDE_PX = 24;

export interface CardFrame {
  /** 0 hidden .. 1 fully shown. */
  alpha: number;
  /** Horizontal offset in px towards the screen centre (0 when settled); the name drifts out to its spot and never nears its edge. */
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

/** Ticks of a big call's scale punch (KO, FIGHT!): short, so it lands as a hit rather than a slow fade-in. */
export const PUNCH_TICKS = 10;
/** Start scale of the punch (shrinks to 1 over PUNCH_TICKS). */
export const PUNCH_SCALE = 1.45;

/**
 * Opacity and scale of a banner `age` ticks old (`left` ticks remain). Big calls (size above 1: KO, FIGHT!) are fully opaque from the
 * first tick and punch in from PUNCH_SCALE (QA r20: a slow translucent fade-in read as a ghost behind the numbers); they only fade out.
 * Other banners keep the slow scale-in (`slowScale`) and the fade-in. Reduced motion: no scale, no fade-in. Pure.
 */
export function bannerFrame(main: string, age: number, left: number, reduced: boolean, slowScale: number, fadeIn: number, fadeOut: number): { alpha: number; scale: number } {
  const out = Math.min(1, left / fadeOut);
  if (bannerSizeFor(main) > 1) {
    const k = reduced ? 0 : Math.max(0, 1 - age / PUNCH_TICKS);
    return { alpha: Math.max(0, out), scale: 1 + (PUNCH_SCALE - 1) * k * k };
  }
  return { alpha: Math.max(0, reduced ? 1 : Math.min(1, (age + 1) / fadeIn, out)), scale: slowScale };
}

/** Warm luminous white for the big calls; bone (white in high contrast) for the small banners, which sit on a dark band (WP-HF1). */
export function bannerColorFor(main: string, hc = false): string {
  if (main === 'K.O.' || main === 'DOUBLE K.O.') return '#fff1c8';
  if (main === 'FIGHT!') return '#ffe9b0';
  return hc ? '#ffffff' : '#ece2c8';
}

const channel = (v: number): number => {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const luminance = (rgb: number): number => 0.2126 * channel((rgb >> 16) & 0xff) + 0.7152 * channel((rgb >> 8) & 0xff) + 0.0722 * channel(rgb & 0xff);

/** WCAG 2 contrast ratio of two 0xRRGGBB colours (1..21). */
export function contrastRatio(fg: number, bg: number): number {
  const a = luminance(fg);
  const b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** `fg` at `alpha` over opaque `bg` (0xRRGGBB). */
export function blendOver(fg: number, alpha: number, bg: number): number {
  let out = 0;
  for (const shift of [16, 8, 0]) {
    const f = (fg >> shift) & 0xff;
    const b = (bg >> shift) & 0xff;
    out |= Math.round(f * alpha + b * (1 - alpha)) << shift;
  }
  return out;
}

export interface BandStrip {
  x: number;
  y: number;
  w: number;
  h: number;
  a: number;
}
/** Colour of the band behind a small banner (the stroke colour). */
export const BANNER_BAND_COLOR = 0x0a0806;
export const BANNER_BAND_ALPHA = 0.65;
export const BANNER_BAND_ALPHA_HC = 0.8;
const BAND_STRIPS = 4;
const BAND_FEATHER = 8;
const BAND_PAD = 6;
/** Alpha of one strip so that four nested strips stack to `core` over the middle. */
const bandStripAlpha = (core: number): number => 1 - (1 - core) ** (1 / BAND_STRIPS);

/**
 * The feathered dark band behind a small banner (ROUND n, TIME ...), as four nested strips written into `out` (reused; returns how many):
 * the innermost covers the text bounds (`top`..`bottom`, centre `cx` and half width `halfW`) plus a pad, each outer one reaches 8 px
 * further. None for the big calls (they have their own halo) and for no banner. `fade` scales the alpha with the banner.
 */
export function bannerBandFor(main: string, fade: number, hc: boolean, cx: number, top: number, bottom: number, halfW: number, out: BandStrip[]): number {
  if (main === '' || bannerSizeFor(main) > 1) return 0;
  const core = (hc ? BANNER_BAND_ALPHA_HC : BANNER_BAND_ALPHA) * fade;
  const a = bandStripAlpha(core);
  for (let i = 0; i < BAND_STRIPS; i++) {
    const grow = BAND_PAD + (BAND_STRIPS - 1 - i) * BAND_FEATHER;
    const r = (out[i] ??= { x: 0, y: 0, w: 0, h: 0, a: 0 });
    r.x = cx - halfW - grow;
    r.y = top - grow;
    r.w = 2 * (halfW + grow);
    r.h = bottom - top + 2 * grow;
    r.a = a;
  }
  return BAND_STRIPS;
}

/** Radial halo strength behind a banner at `age` ticks: peaks at once and decays; none for ordinary banners or reduced motion. */
export function haloFor(main: string, age: number, reduced: boolean): number {
  if (reduced || age < 0 || bannerSizeFor(main) <= 1) return 0;
  return Math.max(0, 1 - age / 40) * 0.55;
}

/** Bone the element colour is pulled toward, so a name never sits as the same hue as a same-element stage floor (qa-r16). */
const CARD_BONE = 0xf2ead4;
const CARD_BONE_MIX = 0.62;

/** The name-card colour for an element colour (0xRRGGBB): mostly bone with a hint of the element, as `#rrggbb`. */
export function cardColorFor(element: number): string {
  let out = 0;
  for (const shift of [16, 8, 0]) {
    const a = (element >> shift) & 0xff;
    const b = (CARD_BONE >> shift) & 0xff;
    out |= Math.round(a + (b - a) * CARD_BONE_MIX) << shift;
  }
  return `#${out.toString(16).padStart(6, '0')}`;
}
