import type Phaser from 'phaser';
import { hash01, toPts } from './grim-fx';
import { DUST_COLOR, HURL_TICKS, ROCK_COLOR, ROCK_DARK, ROLL_TICKS, type Blob } from './quarrak-fx';

/**
 * Quarrak hit FX (roster24, earth), view only: where the thrown rock (Hurl Rock) and the boulder (Boulder Roll) of quarrak-fx.ts
 * end their flight, the rock bursts into flying shards over a dust ring (Hurl Rock) or crumbles into a big dust cloud with falling
 * rubble (Boulder Roll). Drawn at the end of the cast flight (the caller births it at cast tick + `*_FLIGHT`), not read from a hit
 * event, so it also marks a miss. Pure geometry (no Phaser state, no Math.random); reduced motion holds the mid-life pose.
 */
export const HURL_HIT_TICKS = 22;
export const ROLL_HIT_TICKS = 24;
/** Ticks after the cast on which the cast flight of quarrak-fx.ts ends. */
export const HURL_FLIGHT = HURL_TICKS;
export const ROLL_FLIGHT = ROLL_TICKS;
const HURL_REACH = 70 + 160;
const ROLL_REACH = 90 + 210;

export interface RockHitFx {
  /** Flying shards: centre, radius, tilt (rad) for a small angular chip. */
  readonly shards: readonly (Blob & { tilt: number })[];
  readonly dust: readonly Blob[];
  /** Ground ring where the rock lands. */
  readonly ring: { x: number; y: number; r: number };
  readonly alpha: number;
}

function hit(x: number, y: number, dir: number, age: number, ticks: number, reach: number, gy: number, nShards: number, speed: number, nDust: number, dustR: number, seed: number, reduced: boolean): RockHitFx | undefined {
  if (age < 0 || age > ticks) return undefined;
  const t = reduced ? 0.5 : age / ticks;
  // dir8 3..5 faces west
  const side = dir >= 3 && dir <= 5 ? -1 : 1;
  const ax = x + side * reach;
  const ay = y + gy;
  const shards: (Blob & { tilt: number })[] = [];
  for (let i = 0; i < nShards; i++) {
    const ang = -Math.PI * (0.1 + 0.8 * hash01(i, seed)); // upward fan
    const v = speed * (0.6 + hash01(i, seed + 1) * 0.6);
    // Ballistic: out along the fan, pulled down by gravity with t.
    shards.push({ x: ax + Math.cos(ang) * v * t, y: ay + Math.sin(ang) * v * t + 70 * t * t, r: 4 + hash01(i, seed + 2) * 5, a: 1 - t * t * t, tilt: hash01(i, seed + 3) * 6 + (reduced ? 0 : t * 4) });
  }
  const dust: Blob[] = [];
  for (let i = 0; i < nDust; i++) {
    const s = i % 2 === 0 ? 1 : -1;
    const spread = (0.3 + hash01(i, seed + 4) * 0.7) * (reduced ? 1 : Math.min(1, t * 1.8));
    dust.push({ x: ax + s * spread * dustR * 1.6, y: ay - 4 - t * (10 + hash01(i, seed + 5) * 18), r: dustR * (0.35 + 0.5 * Math.min(1, t * 1.6)) * (0.7 + hash01(i, seed + 6) * 0.5), a: reduced ? 0.7 : 0.95 * (1 - t) });
  }
  return { shards, dust, ring: { x: ax, y: ay + 2, r: dustR * 0.8 * Math.min(1, t * 1.8) + 6 }, alpha: reduced ? 0.85 : 1 - t * t };
}

/** Hurl Rock lands `age` view ticks after the rock's flight ends: a shard burst and a dust ring. */
export function hurlImpact(x: number, y: number, dir: number, age: number, reduced: boolean): RockHitFx | undefined {
  return hit(x, y, dir, age, HURL_HIT_TICKS, HURL_REACH, 10, 14, 80, 9, 42, 91, reduced);
}

/** Boulder Roll breaks up `age` view ticks after its flight ends: rubble and a large dust cloud on the ground line. */
export function rollImpact(x: number, y: number, dir: number, age: number, reduced: boolean): RockHitFx | undefined {
  return hit(x, y, dir, age, ROLL_HIT_TICKS, ROLL_REACH, 22, 18, 80, 10, 44, 95, reduced);
}

/** Paints a rock hit: soft dust, the ground ring, then dark-edged shards. */
export function paintRockHit(gfx: Phaser.GameObjects.Graphics, glow: Phaser.GameObjects.Graphics, f: RockHitFx): void {
  for (const d of f.dust) {
    glow.fillStyle(DUST_COLOR, d.a * 0.75).fillCircle(d.x, d.y, d.r);
    glow.fillStyle(0x6e6252, d.a * 0.55).fillCircle(d.x + 3, d.y + 2, d.r * 0.6);
  }
  gfx.lineStyle(7, 0x000000, 0.3 * f.alpha).strokeEllipse(f.ring.x, f.ring.y, f.ring.r * 2, f.ring.r * 0.7);
  gfx.lineStyle(4, DUST_COLOR, 0.9 * f.alpha).strokeEllipse(f.ring.x, f.ring.y, f.ring.r * 2, f.ring.r * 0.7);
  for (const s of f.shards) {
    const pts = toPts([0, 1, 2].flatMap((k) => [s.x + Math.cos(s.tilt + k * 2.1) * s.r, s.y + Math.sin(s.tilt + k * 2.1) * s.r]));
    gfx.fillStyle(ROCK_COLOR, 0.95 * s.a).fillPoints(pts, true);
    gfx.lineStyle(2, ROCK_DARK, 1 * s.a).strokePoints(pts, true);
  }
}
