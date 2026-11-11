import type { Element } from '@core/index';

/**
 * Pure maths and per-element tables for the ability VFX of the pose layer (WP-ability-vfx, FUN-DESIGN 3). No Phaser, no
 * clock, no sim state, no trigonometry (polynomials and a tiny integer LCG only, so every engine draws the same).
 */

/** How one element trails, bursts and gathers. Speeds are px/s, gravity px/s^2 (negative rises), sizes are scale of the 16 px mote. */
export interface ElementFx {
  /** Distance in px between trail puffs, their life in ms, size at birth and death, and initial vertical drift. */
  readonly trailGap: number;
  readonly trailMs: number;
  readonly trailS0: number;
  readonly trailS1: number;
  readonly trailVy: number;
  /** Impact burst: count, outward speed (negative: spawned on a ring and pulled inwards), gravity, life, size at birth and death, upward bias. */
  readonly count: number;
  readonly speed: number;
  readonly gravity: number;
  readonly ms: number;
  readonly s0: number;
  readonly s1: number;
  readonly bias: number;
}

export const ELEMENT_FX: Readonly<Record<Element, ElementFx>> = {
  // Fire: rising embers that shrink; the burst flares up.
  fire: { trailGap: 7, trailMs: 260, trailS0: 0.9, trailS1: 0.1, trailVy: -40, count: 10, speed: 120, gravity: -140, ms: 380, s0: 1, s1: 0.1, bias: -60 },
  // Water and ice: droplets that sag; the burst splashes and falls.
  water: { trailGap: 9, trailMs: 300, trailS0: 0.6, trailS1: 0.3, trailVy: 25, count: 9, speed: 140, gravity: 320, ms: 420, s0: 0.8, s1: 0.2, bias: -90 },
  // Earth: heavy chunks that drop fast; few, large, short-lived.
  earth: { trailGap: 12, trailMs: 340, trailS0: 0.9, trailS1: 0.5, trailVy: 10, count: 7, speed: 110, gravity: 520, ms: 450, s0: 1.3, s1: 0.5, bias: -120 },
  // Air: thin quick streaks that hang in the air; a wide, fast, short burst.
  air: { trailGap: 5, trailMs: 170, trailS0: 0.4, trailS1: 0.1, trailVy: 0, count: 8, speed: 240, gravity: 0, ms: 240, s0: 0.5, s1: 0.1, bias: 0 },
  // Void: motes that pull inwards; the burst collapses onto the hit instead of flying out.
  void: { trailGap: 8, trailMs: 320, trailS0: 0.7, trailS1: 0.9, trailVy: -10, count: 8, speed: -170, gravity: 0, ms: 340, s0: 0.5, s1: 1, bias: 0 },
};

/** The element's index for the small typed arrays of the layer. */
export const FX_ELEMENTS: readonly Element[] = ['fire', 'air', 'earth', 'water', 'void'];

/** Linear congruential step (32-bit, Numerical Recipes constants): the cosmetic stream of the burst directions. */
export function lcg(state: number): number {
  return (Math.imul(state, 1664525) + 1013904223) >>> 0;
}

/** A state mapped to [0, 1). */
export function unit(state: number): number {
  return state / 4294967296;
}

/** A unit-ish direction (x, y) from two stream draws: the square pulled onto a rounded shape by its norm, no trig. */
export function spread(a: number, b: number, out: { x: number; y: number }): void {
  const x = a * 2 - 1;
  const y = b * 2 - 1;
  const n = Math.max(Math.abs(x), Math.abs(y), 0.2) / Math.sqrt(x * x + y * y || 1);
  out.x = x * n;
  out.y = y * n;
}

/** (1 - t)^2 for t in 0..1 (the alpha fall-off of every particle). */
export function fade(t: number): number {
  const k = 1 - Math.min(Math.max(t, 0), 1);
  return k * k;
}

/** Ease-out for an expanding ring or flare. */
export function easeOut(t: number): number {
  const k = 1 - Math.min(Math.max(t, 0), 1);
  return 1 - k * k;
}

/** Glow modes of a character. */
export const GlowMode = { none: 0, charge: 1, release: 2 } as const;

/**
 * The glow's `{ scale, alpha }` at progress `t` (0..1): a charge swells and brightens (quadratic, so it reads as building
 * up) while a release starts bright and shrinks away. Reduced motion keeps a fixed size and only fades.
 */
export function glowLook(mode: number, t: number, reduced: boolean, out: { scale: number; alpha: number }): void {
  const u = Math.min(Math.max(t, 0), 1);
  if (mode === GlowMode.charge) {
    out.scale = reduced ? 1.4 : 0.6 + 1.4 * u * u;
    out.alpha = reduced ? 0.6 * fade(u) : 0.15 + 0.65 * u * u;
  } else {
    out.scale = reduced ? 1.4 : 1.8 - 1.1 * easeOut(u);
    out.alpha = 0.7 * fade(u);
  }
}
