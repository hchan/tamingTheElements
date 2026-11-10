/**
 * The super cinematic plan (FUN-DESIGN sections 2.5 and 3), pure and Phaser-free: what each rendered frame shows.
 * `super-view.ts` draws it; `EventFx` decides when it starts. View only: the freeze itself is the sim's (`hitStop`
 * cause 2), and the music duck is the `superStarted` sound cue's (`sound-map.ts`).
 */

/** Sim tick length in ms (50 Hz). */
export const TICK_MS = 20;
/** Dim to 40% brightness: a black overlay at 60% alpha, faded in and out over SUPER_FADE_MS. */
export const SUPER_DIM = 0.6;
export const SUPER_FADE_MS = 100;
/** The cut-in band slides in over CUT_IN_MS (it fades in instead under reduced motion) and fades out over CUT_OUT_MS. */
export const CUT_IN_MS = 150;
export const CUT_OUT_MS = 200;
/** Camera punch-in on the caster: zoom 1 to 1 + PUNCH_ZOOM over PUNCH_IN_MS, back over PUNCH_OUT_MS (off when reduced). */
export const PUNCH_ZOOM = 0.15;
export const PUNCH_IN_MS = 150;
export const PUNCH_OUT_MS = 300;

/** One frame of the cinematic. `slide` is 0 when the band is in place and 1 when it is a full width off screen. */
export interface SuperFrame {
  dim: number;
  bandAlpha: number;
  slide: number;
  zoom: number;
}

const clamp01 = (t: number): number => Math.min(1, Math.max(0, t));

/**
 * The frame `ms` into a cinematic of `totalMs` (the freeze). Reduced motion keeps the information (dim, band, name)
 * and drops the motion: no slide (the band fades in) and no punch-in. Writes into `out` (no allocation per frame).
 */
export function superFrame(ms: number, totalMs: number, reduced: boolean, out: SuperFrame): SuperFrame {
  const left = totalMs - ms;
  out.dim = SUPER_DIM * clamp01(Math.min(ms, left) / SUPER_FADE_MS);
  const enter = clamp01(ms / CUT_IN_MS);
  // Ease-out slide: fast at first, settling in place.
  out.slide = reduced ? 0 : (1 - enter) * (1 - enter);
  out.bandAlpha = (reduced ? enter : 1) * clamp01(left / CUT_OUT_MS);
  out.zoom = reduced || ms <= 0 ? 1 : 1 + PUNCH_ZOOM * (ms < PUNCH_IN_MS ? ms / PUNCH_IN_MS : clamp01(1 - (ms - PUNCH_IN_MS) / PUNCH_OUT_MS));
  return out;
}
