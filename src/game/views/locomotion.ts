import { walkTime } from '../assets/sheet-frames';
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
  vortigal: { wings: true, legs: false },
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

/**
 * Backward walk (idea backward-walk-animation, Phase 1): while a hero backs away from its foe (the sim walks at half speed
 * then, `backwardWalkX`), the baked walk row plays reversed at a per-hero cadence and a per-hero pose cue rides on top. View
 * only. The cue writes only `rot`, `ox`, `oy` and `alpha` (never scale: boxed portrait rigs reset it); positive `rot` leans
 * the top east. Reduced motion keeps the reversed frames (a frame choice) and adds no motion.
 */
export type BackStyle = 'none' | 'brace' | 'backflap' | 'drift' | 'arc' | 'recede';

export interface BackGait {
  readonly style: BackStyle;
  /** Lean in degrees: away from the foe for brace and backflap, toward it for drift and recede. */
  readonly lean: number;
  /** Walked px per walk frame while backing. */
  readonly stridePx: number;
  /** Constant rise (backflap hover) and the periodic lift (contact dip, flap, wobble or arc height), px. */
  readonly hoverPx: number;
  readonly liftPx: number;
  /** Cue period by distance (px) or by time (ms); whichever is 0 is unused. */
  readonly periodPx: number;
  readonly periodMs: number;
  /** Sway amplitude in degrees, and the sideways lag toward the foe in px. */
  readonly swayDeg: number;
  readonly lagPx: number;
  /** Alpha lost at full effect (recede). */
  readonly alphaDip: number;
  /** Play the walk row reversed (a literal back-flap for wings); false plays it forward at `stridePx`. */
  readonly reverse: boolean;
}

/** Frames in the baked walk row: must equal `['walk', 4]` in `assets/sheet-spec.ts` (a unit test pins it through `frameIndex`). */
export const WALK_FRAMES = 4;

const NONE_GAIT: BackGait = {
  style: 'none', lean: 0, stridePx: STRIDE_PX, hoverPx: 0, liftPx: 0, periodPx: 0, periodMs: 0, swayDeg: 0, lagPx: 0, alphaDip: 0, reverse: true,
};
const gait = (over: Partial<BackGait>): BackGait => ({ ...NONE_GAIT, ...over });

/** By sprite id; a hero without an entry (and the dummy) still reverses its walk row but gets no transform. */
export const BACK_GAIT: Readonly<Record<string, BackGait>> = {
  pax: gait({ style: 'brace', lean: 2.5, stridePx: 24, liftPx: 1.6 }),
  treenoc: gait({ style: 'brace', lean: 3, stridePx: 22, liftPx: 1.6, lagPx: 1 }),
  lavax: gait({ style: 'brace', lean: 3.5, stridePx: 24, liftPx: 1.2 }),
  rokcore: gait({ style: 'brace', lean: 3, stridePx: 24, liftPx: 1.2 }),
  sindarosa: gait({ style: 'backflap', lean: 1.5, stridePx: 30, hoverPx: 3, liftPx: 2, periodMs: 420 }),
  curomo: gait({ style: 'backflap', lean: 1, stridePx: 30, hoverPx: 2, liftPx: 1.5, periodMs: 480, swayDeg: 1.5 }),
  morblass: gait({ style: 'drift', lean: 1, stridePx: 34, periodPx: 48, swayDeg: 0.8, lagPx: 0.5 }),
  ishimi: gait({ style: 'drift', lean: 2, stridePx: 28, liftPx: 1, periodPx: 26, swayDeg: 2.5, lagPx: 1 }),
  echo: gait({ style: 'drift', lean: 1.5, stridePx: 30, periodMs: 900, swayDeg: 2.5, lagPx: 1 }),
  cyclonius: gait({ style: 'drift', lean: 2, stridePx: 30, periodPx: 36, swayDeg: 2, lagPx: 1.5 }),
  fiara: gait({ style: 'drift', lean: 3, stridePx: 30, periodMs: 160, swayDeg: 1.5, lagPx: 1 }),
  wispera: gait({ style: 'arc', stridePx: 30, liftPx: 4, periodPx: 48, swayDeg: 3 }),
  kindrel: gait({ style: 'drift', lean: 3, stridePx: 30, periodMs: 160, swayDeg: 1.5, lagPx: 1 }),
  nykra: gait({ style: 'drift', lean: 2, stridePx: 30, periodPx: 36, swayDeg: 2, lagPx: 1.5 }),
  quarrak: gait({ style: 'brace', lean: 3, stridePx: 22, liftPx: 1.4, lagPx: 1 }),
  hyalia: gait({ style: 'arc', stridePx: 30, liftPx: 4, periodPx: 48, swayDeg: 3 }),
  brazgor: gait({ style: 'brace', lean: 3, stridePx: 24, liftPx: 1.4, lagPx: 1 }),
  glimmaw: gait({ style: 'drift', lean: 1, stridePx: 30, hoverPx: 2, periodPx: 40, swayDeg: 2, lagPx: 1 }),
  durrok: gait({ style: 'brace', lean: 3, stridePx: 22, liftPx: 1.2, lagPx: 1 }),
  zephra: gait({ style: 'arc', stridePx: 34, liftPx: 3, hoverPx: 3, periodPx: 40, swayDeg: 3 }),
  ouroth: gait({ style: 'drift', lean: 2, stridePx: 34, periodPx: 56, swayDeg: 3, lagPx: 1 }),
  abyssor: gait({ style: 'drift', lean: 1, stridePx: 28, hoverPx: 2, periodPx: 44, swayDeg: 2, lagPx: 1 }),
  vortigal: gait({ style: 'backflap', lean: 1.5, stridePx: 30, hoverPx: 3, liftPx: 2, periodMs: 400 }),
  umbrel: gait({ style: 'brace', lean: 2, stridePx: 22, liftPx: 1.2, lagPx: 1 }),
  eternalVoid: gait({ style: 'recede', lean: 1, stridePx: 30, alphaDip: 0.12 }),
};

export function backGaitOf(sprite: string): BackGait {
  return BACK_GAIT[sprite] ?? NONE_GAIT;
}

/** Mirrors `backwardWalkX`: a step away from the foe's side. Uses the pre-step x (`px`) for the side test, as the sim does. */
export function backingAway(x: number, px: number, foeX: number): boolean {
  const step = x - px;
  if (step === 0 || foeX === px) return false;
  return (step > 0) !== (foeX > px);
}

/** Auto-face check: the shown facing (dir8: 0 E, 2 N, 4 W, 6 S) points at the foe's side. Vertical facings never count. */
export function facesToward(face: number, px: number, foeX: number): boolean {
  const fx = face === 0 || face === 1 || face === 7 ? 1 : face >= 3 && face <= 5 ? -1 : 0;
  return fx !== 0 && fx === (foeX > px ? 1 : -1);
}

/** Walk-row time (ms, mid-frame) of the reversed cycle after `phase` px walked at `stridePx` per frame. */
export function walkTimeBack(phase: number, stridePx: number): number {
  return (WALK_FRAMES - 1 - (Math.floor(phase / stridePx) % WALK_FRAMES)) * 125 + 62.5;
}

/** Walk-row time: forward by distance, or the gait's reversed (or slowed) cycle while `backing` away. */
export function walkTimeFor(sprite: string, phase: number, backing: boolean): number {
  if (!backing) return walkTime(phase, STRIDE_PX);
  const g = backGaitOf(sprite);
  return g.reverse ? walkTimeBack(phase, g.stridePx) : walkTime(phase, g.stridePx);
}

/** Reversed legacy walk frame of `count` frames. */
export function walkFrameBack(phase: number, count: number, stridePx: number): number {
  return count <= 0 ? 0 : count - 1 - (Math.floor(phase / stridePx) % count);
}

/**
 * Adds the backward-walk cue into `p`: `amount` 0..1 (eased back amount times move), `side` the foe's side (+1 east, -1 west),
 * `phase` px walked, `ms` the animation clock. Nothing under reduced motion; no allocation.
 */
export function applyBackGait(p: Pose, g: BackGait, amount: number, side: number, phase: number, ms: number, reduced: boolean): void {
  if (reduced || amount <= 0 || g.style === 'none') return;
  const a = amount;
  switch (g.style) {
    case 'brace': {
      p.rot -= side * g.lean * a;
      const t = tri(phase / (2 * g.stridePx));
      p.oy += g.liftPx * (1 - t) * a;
      p.ox += side * g.lagPx * (1 - t) * a;
      break;
    }
    case 'backflap': {
      const t = tri(ms / g.periodMs);
      p.rot -= side * g.lean * a;
      p.oy -= (g.hoverPx + g.liftPx * t) * a;
      p.rot += g.swayDeg * (2 * t - 1) * a;
      break;
    }
    case 'drift': {
      const t = tri(g.periodMs > 0 ? ms / g.periodMs : phase / g.periodPx);
      p.rot += side * g.lean * a;
      p.ox += side * g.lagPx * a;
      p.rot += g.swayDeg * (2 * t - 1) * a;
      p.oy -= g.liftPx * t * a;
      break;
    }
    case 'arc': {
      const u = (phase % g.periodPx) / g.periodPx;
      p.oy -= g.liftPx * 4 * u * (1 - u) * a;
      p.rot -= side * g.swayDeg * (1 - 2 * u) * a;
      break;
    }
    default:
      p.alpha *= 1 - g.alphaDip * a;
      p.rot += side * g.lean * a;
  }
}
