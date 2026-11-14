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

/** "P1 Fire Bomb" when armed, "P1 Fire Bomb (arming)" while it still arms; '' for a free slot. */
export function trapLabel(kind: number, team: number, armLeft: number): string {
  const word = TRAP_WORDS[kind];
  if (word === undefined || kind === TrapKind.none) return '';
  return `P${String(team + 1)} ${word}${armLeft > 0 ? ' (arming)' : ''}`;
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
