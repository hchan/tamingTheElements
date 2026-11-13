/**
 * Arcade hero presentation size (view only; sim boxes never change). Fighting games keep the fighters at about a third of the
 * picture height, so the sprite is drawn bigger than its hitbox, anchored at the feet centre (as Classic's 1.4x already is).
 * Pure: no Phaser, so Node tests and the FX views share it.
 */

/** Display scale of a 1x hero (box 80 px high): about 30% of the 460 px arena strip at 1280x720. */
export const ARCADE_HERO_SCALE = 2;
/** A big body (giant, up to 4x the box) never grows past this display height (world px). */
export const ARCADE_HERO_MAX_H = 200;
/** Smallest scale any body gets, so a giant still reads as bigger than a normal hero. */
export const ARCADE_HERO_MIN_SCALE = 1.25;

/** Display scale for a body with sim box height `h`. */
export function arcadeHeroScale(h: number): number {
  if (h <= 0) return ARCADE_HERO_SCALE;
  return Math.max(ARCADE_HERO_MIN_SCALE, Math.min(ARCADE_HERO_SCALE, ARCADE_HERO_MAX_H / h));
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * The box the sprite shows in: the sim box grown by `k` about the feet centre. FX that hug the body (auras, status marks,
 * aim ring, guard bubble) use this so they stay on the bigger sprite. `out` is filled and returned (no allocation).
 */
export function visualBox(x: number, y: number, w: number, h: number, k: number, out: Box): Box {
  out.x = x - (w * (k - 1)) / 2;
  out.y = y - h * (k - 1);
  out.w = w * k;
  out.h = h * k;
  return out;
}
