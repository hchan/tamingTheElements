import { KNOCKBACK_DECAY_Q4, Q4_ONE } from '../../../data/arcade';
import { SIZE_ONE, sizeOfDef, sizeWeightPm } from '../../../data/size';
import { DIR8_X, DIR8_Y, dir8FromSigns } from '../../../math/dir8';
import { ARCADE_E, ArcadeE, EntityKind, type SimState } from '../../state';
import type { SimWorld } from '../../world';

/**
 * Knockback direction of a hit (FUN-DESIGN 2.3): a projectile's dir8, or for melee the signs of the caster-to-victim
 * centre delta (the melee's own dir when the centres coincide).
 */
export function knockbackDir(s: SimState, source: number, victim: number, dir: number): number {
  if (s.kind[source] !== EntityKind.melee) return dir;
  const caster = s.owner[source] ?? 0;
  const dx = (s.x[victim] ?? 0) + (s.w[victim] ?? 0) / 2 - ((s.x[caster] ?? 0) + (s.w[caster] ?? 0) / 2);
  const dy = (s.y[victim] ?? 0) + (s.h[victim] ?? 0) / 2 - ((s.y[caster] ?? 0) + (s.h[caster] ?? 0) / 2);
  const d = dir8FromSigns(dx, dy);
  return d < 0 ? dir : d;
}

/** Sets the victim's knockback to `speedQ4` along dir8 `dir` (replacing any knockback left). */
export function setKnockback(s: SimState, victim: number, speedQ4: number, dir: number): void {
  const e = victim * ARCADE_E;
  // Giants weigh more (data/size.ts): the same hit shoves them less (integer, truncated toward 0).
  const size = sizeOfDef(s.defId[victim] ?? 0);
  if (size !== SIZE_ONE) speedQ4 = Math.trunc((speedQ4 * 1000) / sizeWeightPm(size));
  s.arcade[e + ArcadeE.kbVx] = (DIR8_X[dir] ?? 0) * speedQ4;
  s.arcade[e + ArcadeE.kbVy] = (DIR8_Y[dir] ?? 0) * speedQ4;
}

/** One knockback decay step: 1 px per tick toward 0. */
function decay(v: number): number {
  if (v > KNOCKBACK_DECAY_Q4) return v - KNOCKBACK_DECAY_Q4;
  if (v < -KNOCKBACK_DECAY_Q4) return v + KNOCKBACK_DECAY_Q4;
  return 0;
}

/**
 * Moves `id` by its knockback for one game tick (`x += kbVx / 16`), clamped to the arena on both axes, then decays the
 * speed. The first wall contact of a combo bounces the victim back at half speed (`wallBounced`); later ones stop it.
 */
export function stepKnockback(world: SimWorld, id: number): void {
  const s = world.state;
  const a = s.arcade;
  const e = id * ARCADE_E;
  let vx = a[e + ArcadeE.kbVx] ?? 0;
  let vy = a[e + ArcadeE.kbVy] ?? 0;
  if (vx === 0 && vy === 0) return;
  const ar = world.arena;
  const maxX = ar.x + ar.w - (s.w[id] ?? 0);
  const maxY = ar.y + ar.h - (s.h[id] ?? 0);
  const x = (s.x[id] ?? 0) + vx / Q4_ONE;
  const y = (s.y[id] ?? 0) + vy / Q4_ONE;
  s.x[id] = Math.min(Math.max(x, ar.x), maxX);
  s.y[id] = Math.min(Math.max(y, ar.y), maxY);
  const wallX = s.x[id] !== x;
  const wallY = s.y[id] !== y;
  if (wallX || wallY) {
    if ((a[e + ArcadeE.wallBounced] ?? 0) === 0) {
      a[e + ArcadeE.wallBounced] = 1;
      vx = Math.trunc(vx / 2) * (wallX ? -1 : 1);
      vy = Math.trunc(vy / 2) * (wallY ? -1 : 1);
    } else {
      vx = 0;
      vy = 0;
    }
  }
  a[e + ArcadeE.kbVx] = decay(vx);
  a[e + ArcadeE.kbVy] = decay(vy);
}
