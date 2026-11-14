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
export const CHIP_SIZE = 36;
export const CHIP_PITCH = 42;
export const CHIP_X0 = 346;
export const CHIP_BAR_Y = 73;
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
  return { x: mirrorX(team, CHIP_X0 + i * CHIP_PITCH, CHIP_SIZE), y: SLIM_ROW_B, size: CHIP_SIZE };
}

/** Bench chip `i`'s mini life bar, under its portrait (the red rest dashes of `tag-view` use it as well). */
export function chipBar(team: number, i: number): SlimBar {
  const x = chipRect(team, i).x;
  return { minX: x, maxX: x + CHIP_SIZE, y: CHIP_BAR_Y, line: 4, lineMax: 5 };
}

/** The tag pill (word above, cooldown bar under it), after `bench` chips. */
export function tagPill(team: number, bench: number): { readonly x: number; readonly wordY: number; readonly barY: number; readonly w: number } {
  return { x: mirrorX(team, CHIP_X0 + bench * CHIP_PITCH + 4, PILL_W), wordY: SLIM_ROW_B + 3, barY: SLIM_ROW_B + CHIP_SIZE - PILL_BAR_H, w: PILL_W };
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
