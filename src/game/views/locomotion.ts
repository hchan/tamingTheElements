import { tri } from './pose-anim';
import { STRIDE_PX, type Pose } from './pose-math';

/**
 * Per-hero locomotion flags and the pure maths of the two movement cues (idea move-animation-wings-knees): winged heroes
 * flap while they move, legged heroes bend their knees. View only, no Phaser, no clock; triangle waves, so no engine
 * trig. The art is baked per frame (a boxed rig cannot flap one wing), so both cues are whole-body offsets and a hint of
 * scale on top of the baked walk row; the caller skips them under reduced motion (the pose then stays steady).
 */
export interface LocomotionFlags {
  /** Streaming wings or plumes: flapped while moving. */
  readonly wings: boolean;
  /** Real legs (root, rubble or hoof): knees bend with every step. */
  readonly legs: boolean;
}

const NONE: LocomotionFlags = { wings: false, legs: false };

/**
 * By sprite id. Most elementals are limbless (tornado, vortex, slime, glacier, pillar of flame) and have neither:
 * Sindarosa's flame plumes are her wings; Pax (rubble legs) and Treenoc (root legs) walk on legs.
 */
export const LOCOMOTION: Readonly<Record<string, LocomotionFlags>> = {
  sindarosa: { wings: true, legs: false },
  pax: { wings: false, legs: true },
  treenoc: { wings: false, legs: true },
};

export function locomotionOf(sprite: string): LocomotionFlags {
  return LOCOMOTION[sprite] ?? NONE;
}

/** Wing-beat period in ms, the lift of the downstroke in px, and the spread (scale) of the beat. */
export const FLAP_MS = 300;
export const FLAP_LIFT_PX = 2.4;
export const FLAP_SPREAD = 0.025;
/** Walked distance of one step (two frames of the four-frame walk) and the knee-bend dip in px and squash. */
export const STEP_PX = STRIDE_PX * 2;
export const KNEE_DIP_PX = 2;
export const KNEE_SQUASH = 0.035;

/** Wing beat 0..1 (1 at the top of the stroke) at animation clock `ms`. */
export function flapPhase(ms: number): number {
  return tri(ms / FLAP_MS);
}

/** Knee bend 0..1 (1 at foot contact, deepest) after `phase` px walked. */
export function kneeBend(phase: number): number {
  return 1 - tri(phase / STEP_PX);
}

/**
 * Adds the movement cues into `p`. `move` is 0..1 (how much the character is walking, eased), `phase` the distance
 * walked in px, `ms` the animation clock. Reduced motion adds nothing. Standing (`move` 0) adds nothing either.
 */
export function applyLocomotion(p: Pose, flags: LocomotionFlags, move: number, phase: number, ms: number, reduced: boolean): void {
  if (reduced || move <= 0) return;
  if (flags.wings) {
    const f = flapPhase(ms);
    p.oy -= FLAP_LIFT_PX * f * move;
    p.sx *= 1 + FLAP_SPREAD * (f - 0.5) * move;
  }
  if (flags.legs) {
    const b = kneeBend(phase);
    p.oy += KNEE_DIP_PX * b * move;
    p.sy *= 1 - KNEE_SQUASH * b * move;
  }
}
