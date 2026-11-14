import type { Element } from '@core/index';

/** Pure view-only hit-feel rules (element spark shapes, KO punch-in). No Phaser, no sim state. */

export interface SparkStyle {
  /** Multiplier on the burst travel distance. */
  readonly reach: number;
  /** Dot radius in logical px. */
  readonly radius: number;
  /** Dot life in ms. */
  readonly lifeMs: number;
  /** Extra vertical travel in px (negative rises, positive falls). */
  readonly drift: number;
}

/** Per-element spark: fire embers rise, air streaks wide and fast, earth chips fall short and heavy, water drops fall, void lingers. */
export const SPARK_STYLE: Readonly<Record<Element, SparkStyle>> = {
  fire: { reach: 1, radius: 3, lifeMs: 280, drift: -14 },
  air: { reach: 1.5, radius: 3, lifeMs: 200, drift: 0 },
  earth: { reach: 0.7, radius: 5, lifeMs: 260, drift: 10 },
  water: { reach: 1, radius: 3.5, lifeMs: 300, drift: 12 },
  void: { reach: 0.8, radius: 4, lifeMs: 360, drift: -4 },
};
export const DEFAULT_SPARK_STYLE: SparkStyle = { reach: 1, radius: 4, lifeMs: 250, drift: 0 };

export function sparkStyleFor(element: Element | undefined): SparkStyle {
  return element ? SPARK_STYLE[element] : DEFAULT_SPARK_STYLE;
}

/** KO punch-in: the camera eases in by this much over the pan framing, then back out. */
export const KO_PUNCH_ZOOM = 1.07;
export const KO_PUNCH_MS = 700;

/** Zoom multiplier `ageMs` after the KO: a smooth bell from 1 up to KO_PUNCH_ZOOM and back to 1; 1 outside the window or when reduced. */
export function koPunchZoom(ageMs: number, reduced: boolean): number {
  if (reduced || !Number.isFinite(ageMs) || ageMs <= 0 || ageMs >= KO_PUNCH_MS) return 1;
  const t = ageMs / KO_PUNCH_MS;
  const bell = Math.sin(Math.PI * t) ** 2;
  return 1 + (KO_PUNCH_ZOOM - 1) * bell;
}

/** KO desaturation wash: the picture drains toward grey on the final blow, then colour seeps back. */
export const KO_WASH_MS = 1100;
export const KO_WASH_PEAK = 0.7;
const KO_WASH_RISE_MS = 120;

/** Desaturation 0..KO_WASH_PEAK `ageMs` after the KO: a fast drain, then a slow ease back; 0 outside the window or when reduced. */
export function koWashStrength(ageMs: number, reduced: boolean): number {
  if (reduced || !Number.isFinite(ageMs) || ageMs <= 0 || ageMs >= KO_WASH_MS) return 0;
  if (ageMs < KO_WASH_RISE_MS) return KO_WASH_PEAK * (ageMs / KO_WASH_RISE_MS);
  const t = (ageMs - KO_WASH_RISE_MS) / (KO_WASH_MS - KO_WASH_RISE_MS);
  return KO_WASH_PEAK * (1 - t) ** 2;
}

/** Hit shockwave ring: a painted element-coloured ripple on heavy hits (strength 2), supers (3) and the KO (weight 4). */
export const RING_MS = 420;
export const RING_POOL = 4;
/** Hit strength at which a ring plays. */
export const RING_MIN_STRENGTH = 2;
/** Ring weight of the KO blow. */
export const RING_KO_WEIGHT = 4;

export interface RingFrame {
  /** Ring radius in logical px. */
  readonly radius: number;
  /** Overall alpha 0..1. */
  readonly alpha: number;
  /** Stroke width in logical px. */
  readonly width: number;
}

/** Ring reach in logical px by weight. */
export function ringReach(weight: number): number {
  return weight >= RING_KO_WEIGHT ? 150 : weight >= 3 ? 110 : 80;
}

/** The ring `ageMs` in (null once done): eases out to full reach while thinning and fading. */
export function ringFrame(ageMs: number, weight: number): RingFrame | null {
  if (!Number.isFinite(ageMs) || ageMs < 0 || ageMs >= RING_MS) return null;
  const t = ageMs / RING_MS;
  const out = 1 - (1 - t) ** 3;
  return { radius: 12 + (ringReach(weight) - 12) * out, alpha: (1 - t) ** 1.5, width: Math.max(1, (weight >= RING_KO_WEIGHT ? 7 : 5) * (1 - t)) };
}
