import { elementCue, healthCue, lifeReadout, type HudCharacter } from './bars';

/**
 * The slim Arcade top bar (Street Fighter / MvC style): a big life bar per side with the hero portrait at its outer end, a name
 * and life line under it, small bench chips (portrait plus a mini life bar), a compact tag pill and the super meter, all inside
 * the top SLIM_H px. Pure geometry and text, no Phaser (the Hud scene draws it; `tag-fx.ts` repeats the bar numbers and a test
 * pins them). The Classic HUD keeps the geometry in `bars.ts`.
 */

export const SLIM_H = 78;
/** Bottom (HUD px) of the flat part of the dark scrim: the 0.38 band ends here. Floating call-outs stay below it (SNAG-CEIL-1). */
export const SCRIM_BOTTOM = 102;
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

/** Extra px the bench chips, their life bars and the tag pill hang lower (tall portrait view: boosted names would touch them; the Hud scene sets it each frame, 0 elsewhere). */
let chipDrop = 0;
export function setChipDrop(px: number): void {
  chipDrop = Math.max(0, Math.round(px));
}
export const getChipDrop = (): number => chipDrop;

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
  return { x: mirrorX(team, PILL_X0 - 4 - CHIP_SIZE - i * CHIP_PITCH, CHIP_SIZE), y: CHIP_Y + chipDrop, size: CHIP_SIZE };
}

/** Bench chip `i`'s mini life bar, under its portrait (the red rest dashes of `tag-view` use it as well). */
export function chipBar(team: number, i: number): SlimBar {
  const x = chipRect(team, i).x;
  return { minX: x, maxX: x + CHIP_SIZE, y: CHIP_BAR_Y + chipDrop, line: CHIP_BAR_LINE, lineMax: CHIP_BAR_LINE + 1 };
}

/** The tag pill (word above, cooldown bar under it), at the inner end of the bar, with the chips outside it. */
export function tagPill(team: number): { readonly x: number; readonly wordY: number; readonly barY: number; readonly w: number } {
  return { x: mirrorX(team, PILL_X0, PILL_W), wordY: CHIP_Y + chipDrop + 6, barY: CHIP_Y + chipDrop + CHIP_SIZE - PILL_BAR_H, w: PILL_W };
}

/** The tag word shown in the pill: the full readout ("TAG READY", "TAG 2.4s", "NO TAG") shortened to "TAG", "2.4s", "NO TAG". */
export function pillWord(label: string): string {
  if (label === 'TAG READY') return 'TAG';
  return label.startsWith('TAG ') ? label.slice(4) : label;
}

/** One line under the bar: `SINDAROSA ▲ Life 228/228`, plus the health word only when it is not OK (never colour alone). */
export function compactLabel(name: string, c: Pick<HudCharacter, 'hp' | 'maxHp' | 'restCap' | 'element'>, noName = false, terse: boolean | 'bare' | 'min' | 'nomark' = false): string {
  const cue = healthCue(c.hp / Math.max(1, c.maxHp));
  const glyph = elementCue(c.element).charAt(0);
  const word = cue.label === 'OK' ? '' : ` ${cue.label}`;
  // `noName`: the phone fallback when the big text would run into the SUPER label (the portrait and the glyph still say who).
  // `terse`: drops the word "Life" (phones: keeps the text at full size instead of shrinking it to fit beside the SUPER label).
  // `'bare'`: also drops "/max" (a long name like TREENOC then keeps the 11 px phone size instead of shrinking or losing letters).
  const terseLife = lifeReadout(c).replace(/^Life /, '');
  // `'min'`: bare life like `'bare'` but whole name: `SINDAROSA ▲ 158`. It keeps the glyph (QA r44: one side lost its mark while the other kept it).
  // `'nomark'`: drops only the glyph and keeps "217/217" (2v2 phones: the whole name beats the mark, which the portrait corner repeats).
  const life = terse === 'bare' || terse === 'min' ? terseLife.replace(/\/\d+$/, '') : terse ? terseLife : lifeReadout(c);
  return `${noName ? '' : `${name.toUpperCase()} `}${terse === 'nomark' ? '' : `${glyph} `}${life}${word}`;
}

/**
 * Portrait phones: one wording for both sides (qa-r88 P3). Current life only (no "Life", no "/max") beside an always-named
 * "SUPER n%", so a bare percentage never reads as a life percentage. Longest first: the whole name, the whole name without the element mark (qa-r89 P1), then without the status word (qa-r90 P1), then ever shorter names (3+ letters, no word).
 */
export function portraitLifeCandidates(name: string, c: Pick<HudCharacter, 'hp' | 'maxHp' | 'restCap' | 'element'>): string[] {
  const whole = compactLabel(name, c, false, 'bare');
  // qa-r89 P1: the whole name beats the element mark when the room is short (the "▲ SAFE" line under it repeats the mark): second candidate.
  const mark = `${elementCue(c.element).charAt(0)} `;
  // qa-r90 P1: the whole name also beats the status word (HURT/LOW; the bar colour and the "▲ SAFE" line still say it): after the mark goes, the word goes, before any letter of the name does.
  const word = healthCue(c.hp / Math.max(1, c.maxHp)).label;
  const noWord = (t: string): string => (word === 'OK' ? t : t.slice(0, t.length - word.length - 1));
  const bare = noWord(whole);
  const out = [...new Set([whole, whole.replace(mark, ''), bare, bare.replace(mark, '')])];
  for (let max = name.length - 1; max >= 3; max--) out.push(noWord(compactLabel(shortName(name, max), c, false, 'bare')));
  return out;
}

/** `name` cut to at most `max` letters with an ellipsis (a phone's narrow life line keeps a short name instead of none); '' when `max` < 3. */
export function shortName(name: string, max: number): string {
  if (name.length <= max) return name;
  return max < 3 ? '' : `${name.slice(0, max - 1)}\u2026`;
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

/** Ms the ghost (lost-life) segment holds after a hit before it drains, and the fraction of max life it drains per ms. */
export const TRAIL_HOLD_MS = 500;
export const TRAIL_DRAIN_PER_MS = 0.0007;
/** Longest frame step the ghost counts (a stalled tab must not skip the hold). */
const TRAIL_MAX_DT = 50;

export interface Trail {
  /** The lagging life (>= current life). */
  v: number;
  /** Ms left of the hold. */
  hold: number;
}

/**
 * Steps a hero's ghost trail by `dtMs` (frame-rate independent): it jumps to any gain, holds TRAIL_HOLD_MS after a loss, then
 * drains to the current life. With reduced motion it holds and then vanishes (no gliding). Returns the lagging life to draw up to.
 */
export function stepTrail(t: Trail, hp: number, maxHp: number, reduced: boolean, dtMs = 1000 / 60): number {
  if (hp >= t.v) {
    t.v = hp;
    t.hold = TRAIL_HOLD_MS;
    return hp;
  }
  const dt = Math.min(TRAIL_MAX_DT, Math.max(0, dtMs));
  if (t.hold > 0) {
    t.hold -= dt;
    return t.v;
  }
  t.v = reduced ? hp : Math.max(hp, t.v - maxHp * TRAIL_DRAIN_PER_MS * dt);
  return t.v;
}
