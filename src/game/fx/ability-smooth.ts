import { ALL_ABILITIES } from '@core/index';
import { REDUCED_FADE_MS } from './motion';

/**
 * Pure render-side easing for ability visuals (grow-in, fade, stretch, throw blend, spin, column envelope).
 * Functions of age only; no Phaser, no sim state, no randomness. Every numeric constant marked "estimate" is a tuning value.
 * With reduced motion there is no stretch, spin or trail: only short alpha fades (at most REDUCED_FADE_MS).
 */

export type SmoothKind = 'shock' | 'lunge' | 'spin' | 'column' | 'grab' | 'pull';

/** Ability sprite key -> smoothing kind. One table; art can later zero an entry out (delete it) to opt a sprite out. */
export const SMOOTH_KIND: Readonly<Record<string, SmoothKind>> = {
  groundShock: 'shock',
  iceShock: 'shock',
  tuskGore: 'lunge',
  stoop: 'lunge',
  hurricane: 'spin',
  tornado: 'column',
  wyrmCoil: 'grab',
  abyssalPull: 'pull',
};

/** Smoothing kind for the ability def at `defIdx` (SimState.defId, an index into ALL_ABILITIES), or undefined. */
export function smoothKindForDef(defIdx: number): SmoothKind | undefined {
  if (!Number.isInteger(defIdx) || defIdx < 0) return undefined;
  const sprite = ALL_ABILITIES[defIdx]?.sprite;
  return sprite === undefined ? undefined : SMOOTH_KIND[sprite];
}

const num = (v: number, fallback = 0): number => (Number.isFinite(v) ? v : fallback);
const clamp01 = (v: number): number => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);
const smoothstep = (t: number): number => {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
};

/** Standard easeOutBack; t is clamped to 0..1, result in 0..~1.1. */
export function easeOutBack(t: number): number {
  const x = clamp01(t);
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2;
}

/** Melee grow-in length (estimate, tuning value). */
export const MELEE_GROW_MS = 40;
/** Melee fade-out length (estimate, tuning value). */
export const MELEE_FADE_MS = 60;
const MELEE_MIN_SCALE = 0.8; // estimate
const MELEE_MIN_ALPHA = 0.6; // estimate

export interface ScaleAlpha {
  readonly scale: number;
  readonly alpha: number;
}

/** Melee flash grow-in: scale 0.8 -> 1 (easeOutBack, may overshoot slightly, never below 0.8), alpha 0.6 -> 1. Reduced: scale 1, short fade. */
export function meleeGrowIn(ageMs: number, reduced: boolean): ScaleAlpha {
  const age = Math.max(0, num(ageMs));
  if (reduced) return { scale: 1, alpha: clamp01(age / REDUCED_FADE_MS) };
  const t = age / MELEE_GROW_MS;
  const scale = Math.max(MELEE_MIN_SCALE, MELEE_MIN_SCALE + (1 - MELEE_MIN_SCALE) * easeOutBack(t));
  return { scale, alpha: MELEE_MIN_ALPHA + (1 - MELEE_MIN_ALPHA) * clamp01(t) };
}

/** Alpha over the last MELEE_FADE_MS of a melee effect: 1 until then, falling linearly to 0 at remaining = 0. */
export function meleeFadeOut(remainingMs: number): number {
  return clamp01(num(remainingMs) / MELEE_FADE_MS);
}

export interface Squash {
  readonly sx: number;
  readonly sy: number;
}

const SETTLE_SQUASH = 0.1; // estimate: peak squash fraction

/** Landing/settle pose over t in 0..1: squashes (wider, shorter) quickly then eases back to 1,1. Both ends are exactly 1. */
export function settlePose(t: number, reduced = false): Squash {
  if (reduced) return { sx: 1, sy: 1 };
  const x = clamp01(t);
  const k = Math.sin(Math.PI * x) * (1 - x); // 0 at both ends, early peak
  return { sx: 1 + SETTLE_SQUASH * k, sy: 1 - SETTLE_SQUASH * k };
}

/** Speed (px/tick) at which the lunge stretch is full (estimate). */
const LUNGE_FULL_SPEED = 12;
const LUNGE_MAX_SX = 1.15; // estimate
const LUNGE_MIN_SY = 0.9; // estimate
/** Trail is drawn only above this speed in px/tick (estimate). */
export const LUNGE_TRAIL_SPEED = 6;

export interface LungeStretch extends Squash {
  readonly trail: boolean;
}

/** Stretch along the lunge: sx up to 1.15, sy down to 0.9, easing to 1 as speed drops. Reduced: no stretch, no trail. */
export function lungeStretch(speedPx: number, reduced: boolean): LungeStretch {
  if (reduced) return { sx: 1, sy: 1, trail: false };
  const speed = Math.max(0, num(speedPx));
  const k = smoothstep(speed / LUNGE_FULL_SPEED);
  return { sx: 1 + (LUNGE_MAX_SX - 1) * k, sy: 1 - (1 - LUNGE_MIN_SY) * k, trail: speed > LUNGE_TRAIL_SPEED };
}

/** Throw/grab blend ramp (estimate, tuning value). */
export const THROW_RAMP_MS = 140;

/**
 * Fraction (0..1) of the way from the start pose p0 to the live sim position: drawn = p0 + (sim - p0) * throwBlend.
 * smoothstep, so it starts and ends with zero slope (no velocity jump); exactly 1 at the end, so zero offset, never past sim.
 */
export function throwBlend(tMs: number, rampMs: number = THROW_RAMP_MS): number {
  const r = num(rampMs, THROW_RAMP_MS);
  if (r <= 0) return 1;
  return smoothstep(Math.max(0, num(tMs)) / r);
}

/** Convenience: one axis of the blended drawn position. */
export function throwDrawn(p0: number, sim: number, tMs: number, rampMs: number = THROW_RAMP_MS): number {
  return p0 + (sim - p0) * throwBlend(tMs, rampMs);
}

/** Hurricane spin rate in rad/ms (estimate, about 1.9 turns per second). */
const SPIN_RAD_PER_MS = 0.012;

/** Continuous spin angle in radians for the effect's lifetime so far. Reduced: 0 (no spin). */
export function hurricaneSpin(fxMs: number, reduced: boolean): number {
  if (reduced) return 0;
  return Math.max(0, num(fxMs)) * SPIN_RAD_PER_MS;
}

const PULSE_MS = 160; // estimate
const PULSE_PEAK = 1.06; // estimate

/** Scale bump 1 -> 1.06 -> 1 over about 160 ms; 1 outside that window. */
export function pulseBump(ageMs: number): number {
  const age = num(ageMs);
  if (age <= 0 || age >= PULSE_MS) return 1;
  return 1 + (PULSE_PEAK - 1) * Math.sin((Math.PI * age) / PULSE_MS) ** 2;
}

export const COLUMN_GROW_MS = 250; // estimate
export const COLUMN_FADE_MS = 300; // estimate
const COLUMN_MIN_SCALE_Y = 0.2; // estimate
const COLUMN_END_SCALE_Y = 0.7; // estimate: height left at the very end of the shrink

export interface ColumnEnv {
  readonly scaleY: number;
  readonly alpha: number;
}

/**
 * Tornado column envelope: grows in over ~250 ms (scaleY 0.2 -> 1, alpha 0 -> 1), then fades and shrinks over the last ~300 ms.
 * Reduced: scaleY 1 and only a short alpha fade in and out.
 */
export function columnEnvelope(ageMs: number, lifeMs: number, reduced: boolean): ColumnEnv {
  const age = Math.max(0, num(ageMs));
  const life = Math.max(0, num(lifeMs));
  const remaining = Math.max(0, life - age);
  if (reduced) {
    return { scaleY: 1, alpha: Math.min(clamp01(age / REDUCED_FADE_MS), clamp01(remaining / REDUCED_FADE_MS)) };
  }
  const grow = smoothstep(age / COLUMN_GROW_MS);
  const fade = smoothstep(remaining / COLUMN_FADE_MS); // 1 -> 0 over the last COLUMN_FADE_MS
  const scaleY = (COLUMN_MIN_SCALE_Y + (1 - COLUMN_MIN_SCALE_Y) * grow) * (COLUMN_END_SCALE_Y + (1 - COLUMN_END_SCALE_Y) * fade);
  return { scaleY, alpha: grow * fade };
}
