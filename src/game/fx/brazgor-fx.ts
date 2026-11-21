import { hash01 } from './grim-fx';

/**
 * Brazgor cast FX (roster24, fire melee), view only: Forge Gore gets an overhead anvil-strike arc with a ground-spark burst in
 * front of the caster, Molten Hide a ring of glowing embers rising round it. Neither has a sim event on cast, so the view reads
 * a rise of the action-bar slot's `readyTick` (as Kindrel and Snag do). Pure geometry (no Phaser, no Math.random): reduced motion
 * draws the same shapes held at their mid-life pose.
 */
export const GORE_SPRITE = 'forgeGore';
export const HIDE_SPRITE = 'moltenHide';
export const GORE_TICKS = 22;
export const HIDE_TICKS = 40;
export const GORE_COLOR = 0xe0782a;
export const HIDE_COLOR = 0xb8480f;
export const GORE_POP = 'GORE';
export const HIDE_POP = 'HIDE';

export interface GoreFx {
  /** Overhead strike arc polyline, x,y pairs. */
  readonly arc: readonly number[];
  /** Impact point and shock radius on the ground in front. */
  readonly impact: { x: number; y: number; r: number };
  readonly sparks: readonly { x: number; y: number; r: number }[];
  readonly alpha: number;
}

/** The blow `age` view ticks after the cast, in front of (x, y) along dir8 `dir` (0 east, 4 west); undefined once over. */
export function forgeGore(x: number, y: number, dir: number, age: number, reduced: boolean): GoreFx | undefined {
  if (age < 0 || age > GORE_TICKS) return undefined;
  const t = reduced ? 0.5 : age / GORE_TICKS;
  const side = dir >= 3 && dir <= 5 ? -1 : 1;
  const ix = x + side * 44;
  const iy = y + 6;
  // The arc swings from above and behind the head down onto the impact point.
  const arc: number[] = [];
  for (let i = 0; i <= 8; i++) {
    const f = i / 8;
    const ang = Math.PI * (0.95 - 0.9 * f);
    arc.push(x + side * (Math.cos(ang) * 40 + 4), y - 6 - Math.sin(ang) * 54 * (1 - 0.35 * f));
  }
  const sparks: { x: number; y: number; r: number }[] = [];
  for (let i = 0; i < 9; i++) {
    const dx = (hash01(i, 51) - 0.5) * 2;
    sparks.push({ x: ix + dx * (14 + t * 30), y: iy - hash01(i, 52) * 26 * Math.sin(Math.PI * Math.min(1, t * 1.2)), r: 3.4 * (1 - t * 0.6) });
  }
  return { arc, impact: { x: ix, y: iy, r: 10 + 40 * t }, sparks, alpha: reduced ? 0.8 : 1 - t * t };
}

export interface HideFx {
  readonly ring: { x: number; y: number; r: number };
  readonly embers: readonly { x: number; y: number; r: number }[];
  readonly alpha: number;
}

/** The hide glow `age` view ticks after the cast, centred on (x, y); embers drift upward off the ring. Undefined once over. */
export function moltenHide(x: number, y: number, age: number, reduced: boolean): HideFx | undefined {
  if (age < 0 || age > HIDE_TICKS) return undefined;
  const t = reduced ? 0.5 : age / HIDE_TICKS;
  const r = 30 + 8 * Math.sin(t * Math.PI);
  const embers: { x: number; y: number; r: number }[] = [];
  for (let i = 0; i < 10; i++) {
    const ang = (i / 10) * Math.PI * 2 + hash01(i, 61) * 0.5;
    const rise = reduced ? 0 : t * (20 + hash01(i, 62) * 24);
    embers.push({ x: x + Math.cos(ang) * r, y: y - Math.sin(ang) * r * 0.8 - rise, r: 3 * (1 - t * 0.5) });
  }
  return { ring: { x, y, r }, embers, alpha: reduced ? 0.7 : 0.9 * (1 - t * t) };
}
