import { BENCH_SPRITE, HUD_WIDTH, benchBar, sideOffset, type BarGeometry } from './bars';

/**
 * The layout and pattern arithmetic the Hud scene uses, with no Phaser: portrait and text anchors, the still speckle patterns
 * (integer hashes, nothing random) and the combo cache key. Pulled out of scenes/Hud.ts so it can be unit-tested; the scene
 * only draws what these return.
 */

/** Classic portrait: the active monster beside its health bar (left of the player's, right of the enemy's). */
export const PORTRAIT = 52;
/** Below the fullscreen button in the top-right corner. */
export const PORTRAIT_Y = 44;
/** Lowest the top of a bench portrait may sit: just under the main bar. */
export const BENCH_TOP = 24;

export function portraitX(team: number): number {
  return team === 0 ? 30 : HUD_WIDTH - 20 - PORTRAIT;
}

/** The square a benched teammate's picture takes in the slot just left of its own bar (small enough to clear the main bar and health words). */
export function benchPortraitRect(team: number, row: number): { x: number; y: number; size: number } {
  const g = benchBar(sideOffset(team), row);
  const size = BENCH_SPRITE - 14;
  return { x: g.minX - 5 - size, y: Math.max(g.y - size / 2, BENCH_TOP), size };
}

/** Where a bench row's regen text sits (right of the player's bars, left of the enemy's). */
export function regenAnchor(team: number, g: Pick<BarGeometry, 'maxX' | 'y'>): { x: number; y: number } {
  return { x: team === 0 ? g.maxX + 10 : sideOffset(1) + 120 - 10 - 2, y: g.y };
}

/** The top of the status-chip row: at least `minTop`, and below the hero's health words as measured (when there are any). */
export function chipRowTop(minTop: number, label: { text: string; y: number; height: number } | undefined): number {
  return Math.max(minTop, label && label.text !== '' ? Math.ceil(label.y + label.height) + 2 : 0);
}

/** The combo text's cache key: a changed hit count or whole-damage value means the label needs rewriting. */
export function comboKey(hits: number, damage: number): number {
  return hits * 100_000 + Math.round(damage);
}

export interface Fleck {
  readonly x: number;
  readonly y: number;
  readonly color: number;
  readonly alpha: number;
}

/** Speckle over a health fill: dark and ash flecks from an integer hash of the x position (a still pattern; nothing flickers). */
export function barGrain(g: Pick<BarGeometry, 'y' | 'line'>, segs: readonly (readonly [number, number])[]): Fleck[] {
  const out: Fleck[] = [];
  for (const [x0, x1] of segs) {
    for (let x = Math.ceil(x0); x < x1; x += 3) {
      const h = Math.imul(x, 2654435761) >>> 28;
      if (h > 5) continue;
      const dy = (h % 3) - 1;
      out.push({ x, y: g.y + dy * (g.line / 3) - 1, color: h < 4 ? 0x0a0806 : 0xcfc4a8, alpha: h < 4 ? 0.35 : 0.14 });
    }
  }
  return out;
}

/** The low-life edge grain: `count` dark flecks in a 1280x720 frame (integer hash, still), pushed toward the screen edge. */
export function edgeGrainFlecks(count = 2600): Fleck[] {
  const W = 1280;
  const H = 720;
  const out: Fleck[] = [];
  for (let i = 0; i < count; i++) {
    const hx = Math.imul(i + 1, 2654435761) >>> 0;
    const hy = Math.imul(i + 7, 1597334677) >>> 0;
    const u = (hx >>> 8) / 16777216;
    const v = (hy >>> 8) / 16777216;
    // Push the points toward the edge (a quadratic bias on the distance from the centre).
    const ex = (u < 0.5 ? -1 : 1) * (1 - Math.pow(1 - Math.abs(u - 0.5) * 2, 2)) * 0.5 + 0.5;
    const ey = (v < 0.5 ? -1 : 1) * (1 - Math.pow(1 - Math.abs(v - 0.5) * 2, 2)) * 0.5 + 0.5;
    out.push({ x: Math.round(ex * W), y: Math.round(ey * H), color: i % 5 === 0 ? 0x4a2a1c : 0x0a0302, alpha: 0.5 });
  }
  return out;
}
