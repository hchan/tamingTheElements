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
