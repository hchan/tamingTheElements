import { TRAP_BOX_PX, TRAP_TRIGGER_PX, TrapKind } from '@core/index';

/**
 * Pure helpers of the Arcade trap marker (WP 39b): the words on a trap, its element colour and its alpha. No Phaser, so
 * trap-fx.test.ts covers them. A trap is never told by colour alone: every marker carries its name, whose it is and, while it
 * is still arming, the word "arming".
 */

/** Name per `TrapKind` (index 0 unused). */
export const TRAP_WORDS: readonly string[] = ['', 'Fire Bomb', 'Puddle', 'Spike', 'Gust'];
/** Element colour per `TrapKind` (index 0 unused): fire, water, earth, air (the terrain patch colours). */
export const TRAP_COLORS: readonly number[] = [0xffffff, 0xff7a1a, 0x3aa0ff, 0xc89650, 0xbfe8f5];
/** The last ticks of a trap's life in which it blinks (motion only). */
export const TRAP_BLINK_TICKS = 40;
/** The marker's outer (trigger-range) square side: the box inflated by TRAP_TRIGGER_PX on every side. */
export const TRAP_RANGE_PX = TRAP_BOX_PX + 2 * TRAP_TRIGGER_PX;

/** "Fire Bomb" for the first side's trap and "Foe Fire Bomb" for the other's (no "P1"/"P2" debug prefix, qa-r3); "(arming)" while it still arms; '' for a free slot. */
export function trapLabel(kind: number, team: number, armLeft: number): string {
  const word = TRAP_WORDS[kind];
  if (word === undefined || kind === TrapKind.none) return '';
  return `${team === 0 ? '' : 'Foe '}${word}${armLeft > 0 ? ' (arming)' : ''}`;
}

/** Marker alpha: dim while arming, full once armed, blinking over the last TRAP_BLINK_TICKS (steady when `reduced`). */
export function trapAlpha(armLeft: number, lifeLeft: number, tick: number, reduced: boolean): number {
  if (armLeft > 0) return 0.5;
  if (reduced || lifeLeft > TRAP_BLINK_TICKS) return 1;
  return Math.floor(tick / 5) % 2 === 0 ? 1 : 0.45;
}

/** How a trap is animated on one frame: `arm` 0..1 (1 once armed), `t` a seconds-like clock, `urgency` 0..1 over the last blink window. */
export interface TrapPhase {
  readonly arm: number;
  readonly t: number;
  readonly urgency: number;
}

/** Arming length the painters scale `arm` by (mirrors TRAP_ARM_TICKS without importing sim data into the pure helper). */
export const TRAP_ARM_VIEW_TICKS = 30;

/** Animation phase of a trap. Reduced motion freezes `t` at a fixed mid pose and drops the urgency pulse; `arm` still shows progress. */
export function trapPhase(armLeft: number, lifeLeft: number, tick: number, reduced: boolean): TrapPhase {
  const arm = armLeft > 0 ? Math.max(0, Math.min(1, 1 - armLeft / TRAP_ARM_VIEW_TICKS)) : 1;
  const urgency = reduced || armLeft > 0 ? 0 : Math.max(0, Math.min(1, 1 - lifeLeft / TRAP_BLINK_TICKS));
  return { arm, t: reduced ? 1.3 : tick / 50, urgency };
}

/** Half the width the painted decal is allowed to span (px): its shadow is 2.2 R wide, so 35 covers R (31) plus the soft edge. */
export const TRAP_DECAL_HALF_PX = 35;

const DASHES = 24;
const DASH_ARC = 0.14;
const FLAT_RY = 0.6;
/** The wall line spans the ring's full height (2 ry) plus this much at each end, px, so the ring reads as closed by the wall. */
export const WALL_MARGIN = 6;
const dashScratch: number[] = [];

/**
 * The trigger-range ring as flat segments `x0, y0, x1, y1, ...` (a shared scratch array, valid until the next call). Mid-arena it is
 * the usual 24 short dashes of an ellipse (rx = TRAP_RANGE_PX / 2, ry = 0.6 rx) round (cx, cy). Where the ellipse would pass beyond
 * `lo + inset` / `hi - inset` the dashes stop inside that line and a solid line along the wall (a little taller than the ring, see WALL_MARGIN) closes it, so the
 * ring reads as cut by the wall and never runs off screen.
 */
export function trapRangeDashes(cx: number, cy: number, lo: number, hi: number, inset = 3): readonly number[] {
  const out = dashScratch;
  out.length = 0;
  const rx = TRAP_RANGE_PX / 2;
  const ry = rx * FLAT_RY;
  const minX = lo + inset;
  const maxX = hi - inset;
  for (let d = 0; d < DASHES; d++) {
    const a0 = (d / DASHES) * Math.PI * 2;
    const a1 = a0 + DASH_ARC;
    const x0 = cx + Math.cos(a0) * rx;
    const x1 = cx + Math.cos(a1) * rx;
    if (x0 < minX || x1 < minX || x0 > maxX || x1 > maxX) continue;
    out.push(x0, cy + Math.sin(a0) * ry, x1, cy + Math.sin(a1) * ry);
  }
  if (cx - rx < minX) out.push(minX, cy - ry - WALL_MARGIN, minX, cy + ry + WALL_MARGIN);
  if (cx + rx > maxX) out.push(maxX, cy - ry - WALL_MARGIN, maxX, cy + ry + WALL_MARGIN);
  return out;
}

/** The label's centre x kept inside `[lo + inset, hi - inset]` for a label `w` wide (unchanged when it fits already). */
export function labelX(cx: number, w: number, lo: number, hi: number, inset = 4): number {
  if (w >= hi - lo - 2 * inset) return cx;
  return Math.min(Math.max(cx, lo + inset + w / 2), hi - inset - w / 2);
}
