import { hash01 } from './grim-fx';
import { SPORE_BOX, SPORE_SPEED } from './umbrel-fx';

/**
 * Umbrel Spore Burst as a procedural speck burst (view only; ideas/brainstorm/umbrel-sporeburst-procedural.md). It replaces the
 * sporeBurst sprite (three failed i2i rounds: cream instead of olive/ochre). Round 2 (art-director REVISE 2.5): normal blend only
 * (additive overlap turned cream), darker weighted palette, bigger hard-edged specks with a dark rim, near full alpha for most of
 * life, thrown 40-90 px off the flight path with a slight downward drift. Pure tick geometry (no Phaser, no sim RNG, no
 * Math.random): the scatter comes from `hash01`, so a stepped probe shows any frame. Reduced motion keeps the shipped sprite plus a puff.
 */
/** Coordinator seam: false makes the views use the shipped sprite path exactly as before the procedural burst. */
export const SPORE_PROCEDURAL = true;
/** The seam as a call, so the false branch in the views is not flagged as dead code. */
export const sporeProcedural = (on: boolean = SPORE_PROCEDURAL): boolean => on;

/** True when the projectile sprite must be hidden because specks replace it (reduced motion keeps the sprite). Also gates the defence view's
 * team-colour trail dots (white core) for this projectile, which read as a cream blob behind the specks. */
export const hidesSporeSprite = (sprite: string, reduced: boolean, procedural: boolean = sporeProcedural()): boolean => procedural && !reduced && sprite === 'sporeBurst';

export const SPECK_COUNT = 26;
/** Weighted palette (weights sum to 100): olive, ochre, dark loam, bright ochre. No yellow-green, no cream. */
export const SPECK_PALETTE: readonly { readonly color: number; readonly weight: number }[] = [
  { color: 0x5a5a22, weight: 40 },
  { color: 0x8a6a1e, weight: 30 },
  { color: 0x3b2f1a, weight: 20 },
  { color: 0xa58a2c, weight: 10 },
];
export const SPECK_COLORS: readonly number[] = SPECK_PALETTE.map((p) => p.color);
/** One darker rim (1 px) on every speck. */
export const SPECK_RIM = { color: 0x2a2412, width: 1 } as const;
/** Radius range (px) and the three size classes (share of specks, min, max): most specks are 7-10 px. */
export const SPECK_RADIUS = { min: 6, max: 14 } as const;
export const SPECK_SIZES: readonly { readonly share: number; readonly min: number; readonly max: number }[] = [
  { share: 0.15, min: 6, max: 7 },
  { share: 0.7, min: 7, max: 10 },
  { share: 0.15, min: 11, max: 14 },
];
/** Throw distance from the flight path (px), gravity (px/tick^2) and the speck alpha at birth. */
export const SPECK_THROW = { min: 40, max: 90 } as const;
export const SPECK_GRAVITY = 0.05;
export const SPECK_ALPHA = 0.9;
/** Ticks each speck lives (alpha holds near full, then eases out) and the spread of birth ticks along the flight. */
export const SPECK_LIFE = { min: 30, max: 40 } as const;
export const SPECK_BIRTH_SPREAD = 28;
/** Ticks the view keeps drawing after the cast (latest birth plus longest life). */
export const SPORE_VIEW_TICKS = SPECK_BIRTH_SPREAD + SPECK_LIFE.max;
export const PUFF_ALPHA = 0.22;
export const PUFF_R = 14;

export interface Speck { readonly x: number; readonly y: number; readonly r: number; readonly a: number; readonly color: number }

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
/** Eight unit vectors (no trig: the repo keeps to LUTs); a per-speck skew below makes the fan irregular. */
const DIRS: readonly (readonly [number, number])[] = [[1, 0], [0.924, 0.383], [0.707, 0.707], [0.383, 0.924], [0, 1], [-0.383, 0.924], [-0.707, 0.707], [-0.924, 0.383]];

const pickColor = (h: number): number => {
  let acc = 0;
  for (const p of SPECK_PALETTE) {
    acc += p.weight / 100;
    if (h < acc) return p.color;
  }
  return SPECK_PALETTE[0]?.color ?? 0x5a5a22;
};
const pickRadius = (h: number, h2: number): number => {
  let acc = 0;
  for (const s of SPECK_SIZES) {
    acc += s.share;
    if (h < acc) return lerp(s.min, s.max, h2);
  }
  return 8;
};

/** Specks `age` view ticks after the cast from caster centre (x, y); dir8 3..5 faces west. Empty outside the view window. */
export function sporeSpecks(x: number, y: number, dir: number, age: number, reduced: boolean): readonly Speck[] {
  if (age < 0 || age > SPORE_VIEW_TICKS) return [];
  const side = dir >= 3 && dir <= 5 ? -1 : 1;
  if (reduced) return [{ x: x + side * (SPORE_BOX + (SPORE_SPEED * 40) / 2), y, r: PUFF_R, a: PUFF_ALPHA, color: SPECK_COLORS[0] ?? 0 }];
  const out: Speck[] = [];
  for (let i = 0; i < SPECK_COUNT; i++) {
    const birth = hash01(i, 201) * SPECK_BIRTH_SPREAD;
    const life = lerp(SPECK_LIFE.min, SPECK_LIFE.max, hash01(i, 202));
    const dt = age - birth;
    if (dt < 0 || dt > life) continue;
    const u = dt / life;
    const [dx, dy] = DIRS[Math.floor(hash01(i, 203) * 8) % 8] ?? [1, 0];
    const skew = (hash01(i, 204) - 0.5) * 0.9;
    const dist = lerp(SPECK_THROW.min, SPECK_THROW.max, hash01(i, 205));
    const out01 = 1 - (1 - u) * (1 - u); // fast out, then settles
    const headX = x + side * (SPORE_BOX + SPORE_SPEED * birth);
    out.push({
      x: headX + (dx - dy * skew) * dist * out01,
      y: y + (dy + dx * skew) * dist * out01 + 0.5 * SPECK_GRAVITY * dt * dt,
      r: pickRadius(hash01(i, 209), hash01(i, 208)),
      a: SPECK_ALPHA * (1 - u * u * u * u), // near full for most of life
      color: pickColor(hash01(i, 207)),
    });
  }
  return out;
}
