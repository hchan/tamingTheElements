import { hash01 } from './grim-fx';

/**
 * Zephra cast FX (roster24, air), view only: Skitter is a quick hop backward (def `skitter`, lunge 140 px, no hit box), so the
 * view draws dust streaks along the hop path and a small dust puff where Zephra lands. The sim has no cast event for it, so the
 * view reads a rise of the action-bar slot's `readyTick` (as Kindrel and Brazgor do). Pure geometry (no Phaser, no Math.random):
 * reduced motion draws the same shapes held at their mid-life pose. Desaturated ash-grey, not a bright whoosh.
 */
export const SKITTER_SPRITE = 'skitter';
export const SKITTER_TICKS = 24;
export const SKITTER_COLOR = 0x9aa6a2;
export const SKITTER_POP = 'SKITTER';
/** The ability's `lungePx` (abilities-c.ts); the hop goes backward, away from the way the caster faces. */
export const SKITTER_HOP_PX = 140;

export interface SkitterFx {
  /** Streak segments along the hop path, x0,y0,x1,y1. */
  readonly streaks: readonly { x0: number; y0: number; x1: number; y1: number }[];
  /** Landing puff: soft ring plus dust motes. */
  readonly puff: { x: number; y: number; r: number };
  readonly motes: readonly { x: number; y: number; r: number }[];
  readonly alpha: number;
}

/** The hop `age` view ticks after the cast from (x, y); dir8 `dir` is the caster's facing (3..5 faces west, so it hops east). */
export function skitterHop(x: number, y: number, dir: number, age: number, reduced: boolean): SkitterFx | undefined {
  if (age < 0 || age > SKITTER_TICKS) return undefined;
  const t = reduced ? 0.5 : age / SKITTER_TICKS;
  const side = dir >= 3 && dir <= 5 ? 1 : -1;
  const ex = x + side * SKITTER_HOP_PX;
  const streaks: { x0: number; y0: number; x1: number; y1: number }[] = [];
  for (let i = 0; i < 5; i++) {
    const y0 = y + (i - 2) * 9 + (hash01(i, 51) - 0.5) * 4;
    const from = hash01(i, 52) * 0.25;
    const len = 0.45 + hash01(i, 53) * 0.35;
    // Streaks trail the hop: their head moves out along the path with t, the tail lags behind.
    const head = Math.min(1, from + len * (0.4 + 0.6 * Math.min(1, t * 2)));
    const tail = Math.max(0, head - len * (0.5 + 0.5 * t));
    streaks.push({ x0: x + side * SKITTER_HOP_PX * tail, y0, x1: x + side * SKITTER_HOP_PX * head, y1: y0 });
  }
  const motes: { x: number; y: number; r: number }[] = [];
  const grown = Math.min(1, t * 1.6);
  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * Math.PI * 2 + hash01(i, 54) * 0.5;
    const d = (10 + 22 * grown) * (0.7 + hash01(i, 55) * 0.6);
    motes.push({ x: ex + Math.cos(ang) * d, y: y + 18 + Math.sin(ang) * d * 0.45 - (reduced ? 0 : t * 8), r: 3 - t * 1.5 });
  }
  return { streaks, puff: { x: ex, y: y + 18, r: 10 + 26 * grown }, motes, alpha: reduced ? 0.8 : 1 - t * t };
}
