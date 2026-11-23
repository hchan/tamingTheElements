import type Phaser from 'phaser';
import { hash01, toPts } from './grim-fx';

/**
 * Quarrak cast FX (roster24, earth ranged), view only: Hurl Rock shows a heavy rock leaving the hands on a short arc with chips
 * falling off it, Boulder Roll a big boulder grinding along the ground with a growing dust cloud behind it. Neither has a sim
 * event on cast (the projectile itself is small), so the view reads a rise of the action-bar slot's `readyTick`, as Kindrel and
 * Brazgor do. Pure geometry (no Phaser state, no Math.random); reduced motion draws the same shapes held at their mid-life pose.
 */
export const HURL_SPRITE = 'hurlRock';
export const ROLL_SPRITE = 'boulderRoll';
export const HURL_TICKS = 18;
export const ROLL_TICKS = 40;
export const ROCK_COLOR = 0x7a6a58;
export const ROCK_DARK = 0x3b3128;
export const DUST_COLOR = 0xa89a84;
export const ROLL_POP = 'ROLL';
export const HURL_POP = 'HURL';

export interface Blob { x: number; y: number; r: number; a: number }
export interface RockFx {
  /** Irregular rock outline, x,y pairs (closed). */
  readonly rock: readonly number[];
  /** Highlight facet on the rock, x,y pairs. */
  readonly facet: readonly number[];
  readonly chips: readonly Blob[];
  readonly dust: readonly Blob[];
  readonly alpha: number;
}

function rockPoly(cx: number, cy: number, r: number, spin: number, seed: number): number[] {
  const pts: number[] = [];
  const n = 8;
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2 + spin;
    const rr = r * (0.78 + 0.3 * hash01(i, seed));
    pts.push(cx + Math.cos(ang) * rr, cy + Math.sin(ang) * rr * 0.9);
  }
  return pts;
}

/** The thrown rock `age` view ticks after the cast, travelling from (x, y) along dir (4 west faces left, otherwise right). */
export function hurlRock(x: number, y: number, dir: number, age: number, reduced: boolean): RockFx | undefined {
  if (age < 0 || age > HURL_TICKS) return undefined;
  const t = reduced ? 0.5 : age / HURL_TICKS;
  const side = dir >= 3 && dir <= 5 ? -1 : 1;
  const cx = x + side * (70 + 160 * t);
  const cy = y - 10 - 26 * Math.sin(Math.PI * t) * 1 + 14 * t;
  const rock = rockPoly(cx, cy, 26, reduced ? 0 : t * 5 * side, 71);
  const chips: Blob[] = [];
  for (let i = 0; i < 7; i++) {
    const lag = 0.08 + hash01(i, 72) * 0.3;
    const tt = Math.max(0, t - lag);
    chips.push({ x: x + side * (70 + 160 * tt) + (hash01(i, 73) - 0.5) * 14, y: y - 4 + 40 * tt * tt * 3 * hash01(i, 74) + (hash01(i, 75) - 0.5) * 14, r: 2.6 + hash01(i, 76) * 2.4, a: 1 - t * 0.6 });
  }
  const facet = [cx - 8, cy - 9, cx + 4, cy - 12, cx + 2, cy - 2, cx - 9, cy];
  return { rock, facet, chips, dust: [], alpha: reduced ? 0.9 : 1 - t * t * 0.7 };
}

/** The roller `age` view ticks after the cast: a large boulder on the ground line, dust puffs hanging behind it. */
export function boulderRoll(x: number, y: number, dir: number, age: number, reduced: boolean): RockFx | undefined {
  if (age < 0 || age > ROLL_TICKS) return undefined;
  const t = reduced ? 0.5 : age / ROLL_TICKS;
  const side = dir >= 3 && dir <= 5 ? -1 : 1;
  const gy = y + 22;
  const cx = x + side * (90 + 210 * t);
  const r = 46;
  const rock = rockPoly(cx, gy - r * 0.8, r, reduced ? 0 : t * 9 * side, 81);
  const facet = [cx - 15, gy - r * 1.5, cx + 6, gy - r * 1.7, cx + 4, gy - r * 1.1, cx - 16, gy - r * 0.95];
  const dust: Blob[] = [];
  for (let i = 0; i < 12; i++) {
    const born = (i / 12) * 0.8;
    if (t < born) continue;
    const life = (t - born) / 0.5;
    if (life > 1 && !reduced) continue;
    const l = Math.min(1, life);
    dust.push({ x: x + side * (90 + 210 * born) - side * 6 * l, y: gy - 6 - l * (14 + hash01(i, 82) * 14), r: 10 + l * 16 + hash01(i, 83) * 6, a: reduced ? 0.55 : 0.8 * (1 - l) });
  }
  return { rock, facet, chips: [], dust, alpha: reduced ? 0.9 : 1 - t * t * 0.5 };
}

/** Paints a rock cast onto the base and glow graphics: dark underlay, mottled stone, pale facet, then chips and soft dust. */
export function paintRock(gfx: Phaser.GameObjects.Graphics, glow: Phaser.GameObjects.Graphics, f: RockFx): void {
  for (const d of f.dust) {
    glow.fillStyle(DUST_COLOR, d.a * 0.5).fillCircle(d.x, d.y, d.r);
    glow.fillStyle(0x6e6252, d.a * 0.35).fillCircle(d.x + 3, d.y + 2, d.r * 0.6);
  }
  const pts = toPts(f.rock);
  gfx.fillStyle(0x000000, 0.25 * f.alpha).fillPoints(toPts(f.rock.map((v, i) => v + (i % 2 === 0 ? 3 : 4))), true);
  gfx.fillStyle(ROCK_COLOR, 0.95 * f.alpha).fillPoints(pts, true);
  gfx.lineStyle(3, ROCK_DARK, 0.9 * f.alpha).strokePoints(pts, true);
  gfx.fillStyle(0xb7a88f, 0.55 * f.alpha).fillPoints(toPts(f.facet), true);
  for (const c of f.chips) gfx.fillStyle(ROCK_COLOR, c.a).fillCircle(c.x, c.y, c.r).lineStyle(1, ROCK_DARK, c.a).strokeCircle(c.x, c.y, c.r);
}
