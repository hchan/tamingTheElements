import { hash01 } from './grim-fx';
import { SPORE_BOX, SPORE_SPEED, SPORE_TICKS } from './umbrel-fx';

/**
 * Umbrel Spore Burst as a procedural speck burst (view only; ideas/brainstorm/umbrel-sporeburst-procedural.md). It replaces the
 * sporeBurst sprite (three failed i2i rounds: cream instead of olive/ochre). Specks are thrown outward from the flying cloud and fade.
 * Pure tick geometry (no Phaser, no sim RNG, no Math.random): the scatter comes from `hash01`, so a stepped probe shows any frame.
 * Reduced motion keeps the shipped sprite and adds one faint puff.
 */
export const SPECK_COUNT = 18;
/** Olive, ochre and dark loam only (the spore olive plus the brown of the shipped sprite); no cream. */
export const SPECK_COLORS: readonly number[] = [0x8a8f3c, 0x7a7a30, 0x9a7a2c, 0x7c5c24, 0x5a4a2a];
/** Speck radius at birth (px), start-offset radius round the cloud centre (px) and the throw speed (px/tick). */
export const SPECK_RADIUS = { min: 4, max: 10 } as const;
export const SPECK_START_R = 16;
export const SPECK_SPEED = { min: 1.6, max: 4.2 } as const;
/** Ticks each speck lives, and the spread of birth ticks (the burst keeps puffing while the cloud flies). */
export const SPECK_LIFE = { min: 14, max: 20 } as const;
export const SPECK_BIRTH_SPREAD = 20;
export const PUFF_ALPHA = 0.22;
export const PUFF_R = 14;

export interface Speck { readonly x: number; readonly y: number; readonly r: number; readonly a: number; readonly color: number }

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
/** Eight unit vectors (no trig: the repo keeps to LUTs); a per-speck skew below makes the fan irregular. */
const DIRS: readonly (readonly [number, number])[] = [[1, 0], [0.924, 0.383], [0.707, 0.707], [0.383, 0.924], [0, 1], [-0.383, 0.924], [-0.707, 0.707], [-0.924, 0.383]];

/** Specks `age` view ticks after the cast from caster centre (x, y); dir8 3..5 faces west. Empty outside the cast window. */
export function sporeSpecks(x: number, y: number, dir: number, age: number, reduced: boolean): readonly Speck[] {
  if (age < 0 || age > SPORE_TICKS) return [];
  const side = dir >= 3 && dir <= 5 ? -1 : 1;
  if (reduced) return [{ x: x + side * (SPORE_BOX + (SPORE_SPEED * SPORE_TICKS) / 2), y, r: PUFF_R, a: PUFF_ALPHA, color: SPECK_COLORS[0] ?? 0 }];
  const out: Speck[] = [];
  for (let i = 0; i < SPECK_COUNT; i++) {
    const birth = hash01(i, 201) * SPECK_BIRTH_SPREAD;
    const life = lerp(SPECK_LIFE.min, SPECK_LIFE.max, hash01(i, 202));
    const dt = age - birth;
    if (dt < 0 || dt > life) continue;
    const u = dt / life;
    const [dx, dy] = DIRS[Math.floor(hash01(i, 203) * 8) % 8] ?? [1, 0];
    const skew = (hash01(i, 204) - 0.5) * 0.9;
    const ux = dx - dy * skew;
    const uy = dy + dx * skew;
    const v = lerp(SPECK_SPEED.min, SPECK_SPEED.max, hash01(i, 205));
    const start = Math.sqrt(hash01(i, 206)) * SPECK_START_R;
    const headX = x + side * (SPORE_BOX + SPORE_SPEED * birth);
    const run = v * dt * (1 - u * 0.5); // slows as it fades
    const idx = Math.floor(hash01(i, 207) * SPECK_COLORS.length) % SPECK_COLORS.length;
    out.push({
      x: headX + ux * (start + run),
      y: y + uy * (start + run) + u * u * 6,
      r: lerp(SPECK_RADIUS.min, SPECK_RADIUS.max, hash01(i, 208)) * (1 - u * 0.4),
      a: 0.9 * (1 - u * u),
      color: SPECK_COLORS[idx] ?? 0x8a8f3c,
    });
  }
  return out;
}
