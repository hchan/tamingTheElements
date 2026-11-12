import { DIR8_X, DIR8_Y, dir8FromSigns } from '../../../math/dir8';
import { isArcade } from '../../clock';
import { ARCADE_E, ArcadeE, type SimState } from '../../state';

/**
 * Arcade 8-way aim (FUN-DESIGN 2.12, WP-arcade-8way-aim). Movement stores `dir8FromSigns` of the held input in the
 * entity's `aim` slot (plus one) whenever it updates the 4-way `dir`, so a released stick keeps its last aim, and the
 * reels (`dir`) stay 4-way. Shots, melee boxes and the knockback of those hits use `castDir`; the super's band keeps
 * the 4-way `dir`. Classic never writes `aim` (its Arcade block is empty) and `castDir` is the plain `dir` there.
 */
export function castDir(s: SimState, id: number): number {
  const aim = isArcade(s) ? (s.arcade[id * ARCADE_E + ArcadeE.aim] ?? 0) : 0;
  return aim > 0 ? aim - 1 : (s.dir[id] ?? 0);
}

/** Records dir8 `d` (0..7) as `id`'s aim; Arcade only (the caller is the Arcade movement branch). */
export function setAim(s: SimState, id: number, d: number): void {
  s.arcade[id * ARCADE_E + ArcadeE.aim] = d + 1;
}

/** The 8-way direction from `id` towards `foe` (FUN-DESIGN 2.17): a diagonal unless one axis offset is 2x the other. */
export function dirToward(s: SimState, id: number, foe: number): number {
  const dx = (s.x[foe] ?? 0) + (s.w[foe] ?? 0) / 2 - (s.x[id] ?? 0) - (s.w[id] ?? 0) / 2;
  const dy = (s.y[foe] ?? 0) + (s.h[foe] ?? 0) / 2 - (s.y[id] ?? 0) - (s.h[id] ?? 0) / 2;
  return dir8FromSigns(Math.abs(dx) * 2 <= Math.abs(dy) ? 0 : dx, Math.abs(dy) * 2 <= Math.abs(dx) ? 0 : dy);
}

/** True for the four diagonal dir8 values (the player's deliberate aim; FUN-DESIGN 2.22 auto-face). */
export function isDiagonal8(d: number): boolean {
  return d >= 0 && (DIR8_X[d] ?? 0) !== 0 && (DIR8_Y[d] ?? 0) !== 0;
}
