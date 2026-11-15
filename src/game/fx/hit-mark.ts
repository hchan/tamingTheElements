import type { Element } from '@core/index';

/**
 * Element hit marks (QA r47/r48/r49: the contact mark was one white asterisk for every element). Pure palette and geometry, no
 * Phaser: fire throws tapered ember flares that rise, water throws droplets that fall with a splash ring, earth throws tumbling
 * chips with a dust puff, air cuts thin parallel slash lines, void throws violet shards. Colours are deep, mid and pale tones of
 * the element (never pure white), so stacked additive lines glow instead of blowing out. Shape and colour both differ per element,
 * so colour is never the only cue. View-only.
 */
export type MarkShape = 'flare' | 'droplets' | 'chips' | 'slashes' | 'shards';

export interface MarkStyle {
  readonly shape: MarkShape;
  /** Main body tone (additive glow). */
  readonly body: number;
  /** Pale heart of lines and the contact core (a tint of the element, not white). */
  readonly core: number;
  /** Dark rim drawn under pale marks so they read on the pale floors. */
  readonly rim: number;
  /** Gravity on the pieces in px over the mark's life (positive falls, negative rises). */
  readonly gravity: number;
  /** Multiplier on how long the lines reach (air slashes run long, earth chips stay short). */
  readonly reach: number;
}

export const MARK_STYLE: Readonly<Record<Element, MarkStyle>> = {
  fire: { shape: 'flare', body: 0xff6a14, core: 0xffc060, rim: 0x3a0e04, gravity: -18, reach: 1 },
  water: { shape: 'droplets', body: 0x1f64e0, core: 0x78b8ff, rim: 0x041a44, gravity: 46, reach: 0.9 },
  earth: { shape: 'chips', body: 0x9a6428, core: 0xdc9a3c, rim: 0x2a1406, gravity: 54, reach: 0.65 },
  air: { shape: 'slashes', body: 0x7ee0a0, core: 0xf0ffe6, rim: 0x0a3a1e, gravity: 0, reach: 1.45 },
  void: { shape: 'shards', body: 0xa060f0, core: 0xe0c8ff, rim: 0x14042a, gravity: -6, reach: 0.85 },
};

/** The style of `element`, or undefined for an unknown attacker (the caller then falls back to its own colour). */
export function markStyleFor(element: Element | undefined): MarkStyle | undefined {
  return element === undefined ? undefined : MARK_STYLE[element];
}

/** Reduced motion: how long the still mark shows, ms, and the pose (0..1 through its life) it is drawn in. */
export const STILL_MS = 260;
export const STILL_POSE = 0.45;
/** Most contact cores and still marks alive at once (the streak pool caps the lines). */
export const MARK_CAP = 12;

/** Alpha of a still mark `ageMs` in: held, then a soft fade over the last 40%. 0 once over or for a bad age. */
export function stillAlpha(ageMs: number): number {
  if (!Number.isFinite(ageMs) || ageMs < 0 || ageMs >= STILL_MS) return 0;
  const t = ageMs / STILL_MS;
  return t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4;
}

/** Position offset of a piece `t` (0..1) through its life under `gravity`: it falls (or rises) quadratically, in px. */
export function gravityDrop(gravity: number, t: number): number {
  return gravity * t * t;
}

/** `high`: high-contrast boosts body alpha and doubles the dark rim so marks stand out. Never above 1. */
export function markAlpha(alpha: number, highContrast: boolean): number {
  return Math.min(1, Math.max(0, highContrast ? alpha * 1.35 : alpha));
}
export const markRimWidth = (base: number, highContrast: boolean): number => (highContrast ? base * 2 : base);

/** Dust puff tone of the earth mark (amber-brown, not the pale cream it was). Exported so the palette test can see it. */
export const EARTH_DUST = 0x8a6030;

/** Squared RGB distance between two 0xRRGGBB colours (palette distinctness checks). */
export function colorDistSq(a: number, b: number): number {
  const dr = ((a >> 16) & 255) - ((b >> 16) & 255);
  const dg = ((a >> 8) & 255) - ((b >> 8) & 255);
  const db = (a & 255) - (b & 255);
  return dr * dr + dg * dg + db * db;
}
