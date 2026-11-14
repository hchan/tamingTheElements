import { elementCue, healthCue, lifeReadout, type HudCharacter } from './bars';

/**
 * The slim Arcade top bar (Street Fighter / MvC style): a big life bar per side with the hero portrait at its outer end, a name
 * and life line under it, small bench chips (portrait plus a mini life bar), a compact tag pill and the super meter, all inside
 * the top SLIM_H px. Pure geometry and text, no Phaser (the Hud scene draws it; `tag-fx.ts` repeats the bar numbers and a test
 * pins them). The Classic HUD keeps the geometry in `bars.ts`.
 */

export const SLIM_H = 78;
export const SLIM_BAR_Y = 20;
export const SLIM_LINE = 16;
export const SLIM_LINE_MAX = 18;
export const SLIM_PORTRAIT = 48;
export const SLIM_PORTRAIT_Y = 6;
/** Top of the second row (name, chips, tag, meter). */
export const SLIM_ROW_B = 34;
/** Bench portraits (qa-r5-bench-portraits-small): 68 px squares (qa-r13: was 56, too small to read next to the round pips), chip 0 nearest the tag pill, hanging a little under the band. */
export const CHIP_SIZE = 68;
export const CHIP_PITCH = 72;
/** The bench row sits under the timer strip (super segments end at y 50), so the chips never cover it (qa-r7-hud-2v2). */
export const CHIP_Y = 58;
export const CHIP_BAR_Y = CHIP_Y + CHIP_SIZE + 5;
export const CHIP_BAR_LINE = 6;
/** Left edge of the tag pill for team 0 (right edge 550: a clear gap to the round pips and the timer, qa-r15). */
export const PILL_X0 = 506;
/** Bottom of the lowest bench life bar: the status-chip row starts under it when a side has a bench. */
export const CHIP_BOTTOM = CHIP_BAR_Y + CHIP_BAR_LINE / 2 + 2;
export const PILL_W = 44;
export const PILL_BAR_H = 8;

export interface SlimBar {
  readonly minX: number;
  readonly maxX: number;
  readonly y: number;
  readonly line: number;
  readonly lineMax: number;
}

/** Mirror a left-side x range for team 1 (the right side of the 1280 frame). */
export const mirrorX = (team: number, x: number, w: number): number => (team === 0 ? x : 1280 - x - w);

/** Team 0's bar spans 120..580, team 1's 700..1160 (both fill left to right), 120 px apart round the timer. */
export function slimBar(team: number): SlimBar {
  const minX = team === 0 ? 120 : 700;
  return { minX, maxX: minX + 460, y: SLIM_BAR_Y, line: SLIM_LINE, lineMax: SLIM_LINE_MAX };
}

/** The active hero's portrait square at the outer end of the bar (the right one clears the fullscreen button). */
export function slimPortrait(team: number): { readonly x: number; readonly y: number; readonly size: number } {
  return { x: team === 0 ? 62 : 1170, y: SLIM_PORTRAIT_Y, size: SLIM_PORTRAIT };
}

/** Bench chip `i`: the portrait square. */
export function chipRect(team: number, i: number): { readonly x: number; readonly y: number; readonly size: number } {
  return { x: mirrorX(team, PILL_X0 - 4 - CHIP_SIZE - i * CHIP_PITCH, CHIP_SIZE), y: CHIP_Y, size: CHIP_SIZE };
}

/** Bench chip `i`'s mini life bar, under its portrait (the red rest dashes of `tag-view` use it as well). */
export function chipBar(team: number, i: number): SlimBar {
  const x = chipRect(team, i).x;
  return { minX: x, maxX: x + CHIP_SIZE, y: CHIP_BAR_Y, line: CHIP_BAR_LINE, lineMax: CHIP_BAR_LINE + 1 };
}

/** The tag pill (word above, cooldown bar under it), at the inner end of the bar, with the chips outside it. */
export function tagPill(team: number): { readonly x: number; readonly wordY: number; readonly barY: number; readonly w: number } {
  return { x: mirrorX(team, PILL_X0, PILL_W), wordY: CHIP_Y + 6, barY: CHIP_Y + CHIP_SIZE - PILL_BAR_H, w: PILL_W };
}

/** The tag word shown in the pill: the full readout ("TAG READY", "TAG 2.4s", "NO TAG") shortened to "TAG", "2.4s", "NO TAG". */
export function pillWord(label: string): string {
  if (label === 'TAG READY') return 'TAG';
  return label.startsWith('TAG ') ? label.slice(4) : label;
}

/** One line under the bar: `SINDAROSA ▲ Life 228/228`, plus the health word only when it is not OK (never colour alone). */
export function compactLabel(name: string, c: Pick<HudCharacter, 'hp' | 'maxHp' | 'restCap' | 'element'>): string {
  const cue = healthCue(c.hp / Math.max(1, c.maxHp));
  const glyph = elementCue(c.element).charAt(0);
  const word = cue.label === 'OK' ? '' : ` ${cue.label}`;
  return `${name.toUpperCase()} ${glyph} ${lifeReadout(c)}${word}`;
}

/** The yellow chip-trail colour: the life just lost (street-fighter style), instead of plain white. */
export const TRAIL_COLOR = 0xe8c04a;
/** Below this fraction the bar flashes red. */
export const LOW_FLASH_AT = 0.25;
const WOUND = 0x9b8738;
const EMBER = 0x8a2b1c;
const lerpRgb = (a: number, b: number, k: number): number => {
  const ch = (shift: number): number => Math.round(((a >> shift) & 255) + ((((b >> shift) & 255) - ((a >> shift) & 255)) * k));
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
};

/**
 * Life fill for the slim bars: the hero's (already muted) element colour while healthy, going to tallow ochre at half and ember red
 * by a quarter. `pulse` (0..1) lifts a critical bar toward a bright red, the low-health flash. Pure.
 */
export function lifeFill(elementColor: number, fractionValue: number, pulse = 0): number {
  const p = Number.isNaN(fractionValue) ? 1 : Math.min(1, Math.max(0, fractionValue));
  if (p <= LOW_FLASH_AT) return lerpRgb(EMBER, 0xe0402e, pulse);
  if (p >= 0.5) return elementColor;
  return lerpRgb(EMBER, WOUND, (p - LOW_FLASH_AT) / (0.5 - LOW_FLASH_AT));
}

/** Frames the white damage trail holds after a hit before it drains, and the fraction of max life it drains per frame. */
export const TRAIL_HOLD = 18;
export const TRAIL_DRAIN = 0.012;

export interface Trail {
  /** The lagging life (>= current life). */
  v: number;
  hold: number;
}

/**
 * Steps a hero's white chip-drain trail: it jumps to any gain, holds TRAIL_HOLD frames after a loss, then drains. With reduced
 * motion it holds and then vanishes (no gliding). Returns the lagging life to draw up to.
 */
export function stepTrail(t: Trail, hp: number, maxHp: number, reduced: boolean): number {
  if (hp >= t.v) {
    t.v = hp;
    t.hold = TRAIL_HOLD;
    return hp;
  }
  if (t.hold > 0) {
    t.hold--;
    return t.v;
  }
  t.v = reduced ? hp : Math.max(hp, t.v - maxHp * TRAIL_DRAIN);
  return t.v;
}
