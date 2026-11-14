import { METER_BAR, METER_BARS } from '@core/index';

/**
 * Pure Arcade HUD model (no Phaser): pooled floating damage numbers, the per-team combo counter and the hyper meter
 * (docs/FUN-DESIGN.md section 3). The Arena feeds it and ages it while the sim runs; the Hud scene only draws it.
 */

export const NUMBER_SLOTS = 16;
export const NUMBER_MS = 400;
export const NUMBER_RISE_PX = 24;
/** Offsets (px) of consecutive numbers, cycled by slot. */
export const NUMBER_FAN: readonly (readonly [number, number])[] = [[0, 0], [-30, -12], [30, -12], [0, -24]];
/** Combos show from this many hits; the last count stays up this long after the combo ends. */
export const COMBO_MIN_HITS = 2;
export const COMBO_HOLD_MS = 1000;
export const COMBO_POP_MS = 200;
export const COMBO_POP_SCALE = 0.4;
export const COMBO_MILESTONES: readonly number[] = [3, 5, 8];

export interface DamageNumber {
  live: boolean;
  /** Bumped on every spawn, so the view re-renders the text only when the slot was reused. */
  serial: number;
  x: number;
  y: number;
  amount: number;
  /** Combo-scaled (greyed and smaller). */
  scaled: boolean;
  counter: boolean;
  age: number;
}

/** Hyper meter bar: METER_BARS segments of SEGMENT_W x SEGMENT_H px with SEGMENT_GAP between, under the HUD. */
export const SEGMENT_W = 28;
export const SEGMENT_H = 10;
export const SEGMENT_GAP = 3;
export const METER_W = METER_BARS * SEGMENT_W + (METER_BARS - 1) * SEGMENT_GAP;
/**
 * The meter row sits clear of the HUD block (100 px) and of the health text under the bars (y 24, 16 px), and each meter
 * stops METER_INSET short of its bar's inner end, so the centre column (round timer and pips) has room on both sides.
 */
export const METER_Y = 40;
export const METER_INSET = 0;
/** A full meter pulses its fill once per METER_PULSE_MS (one flash a second: under the WCAG 2.3.1 limit of 3). */
export const METER_PULSE_MS = 1000;
/** Dash pattern (on, off px) of the segment that is still filling, so full and charging differ without colour. */
export const CHARGE_DASH: readonly [number, number] = [4, 3];

export interface MeterShown {
  value: number;
  /** Ms since the meter became full (counts only while full). */
  full: number;
}

export interface ComboShown {
  /** Hits shown (0 = hidden). */
  hits: number;
  damage: number;
  /** Ms left before a finished combo disappears. */
  hold: number;
  /** Ms since the last milestone pop. */
  pop: number;
}

export class ArcadeHudModel {
  readonly numbers: readonly DamageNumber[];
  readonly combos: readonly [ComboShown, ComboShown];
  readonly meters: readonly [MeterShown, MeterShown] = [{ value: 0, full: 0 }, { value: 0, full: 0 }];
  private next = 0;

  constructor() {
    const numbers: DamageNumber[] = [];
    for (let i = 0; i < NUMBER_SLOTS; i++) {
      numbers.push({ live: false, serial: 0, x: 0, y: 0, amount: 0, scaled: false, counter: false, age: 0 });
    }
    this.numbers = numbers;
    const combo = (): ComboShown => ({ hits: 0, damage: 0, hold: 0, pop: COMBO_POP_MS });
    this.combos = [combo(), combo()];
  }

  /**
   * A damage number at (x, y); the oldest slot is reused once all are in flight. Consecutive numbers fan out
   * (NUMBER_FAN) so hits landing on the same tick do not cover each other.
   */
  spawn(x: number, y: number, amount: number, scaled: boolean, counter: boolean): void {
    const fan = NUMBER_FAN[this.next % NUMBER_FAN.length] ?? [0, 0];
    const n = this.numbers[this.next];
    this.next = (this.next + 1) % NUMBER_SLOTS;
    if (!n) return;
    n.live = true;
    n.serial++;
    n.x = x + fan[0];
    n.y = y + fan[1];
    n.amount = amount;
    n.scaled = scaled;
    n.counter = counter;
    n.age = 0;
  }

  /** Advances by `ms`. `hits`, `damage` and `meter` are the live combo and hyper meter per team (RenderView.arcade()). */
  update(ms: number, hits: readonly number[], damage: readonly number[], meter: readonly number[] = NO_METER): void {
    for (let team = 0; team < this.meters.length; team++) {
      const m = this.meters[team];
      if (!m) continue;
      m.value = meter[team] ?? 0;
      m.full = meterBarsOf(m.value) >= METER_BARS ? m.full + ms : 0;
    }
    for (const n of this.numbers) {
      if (!n.live) continue;
      n.age += ms;
      if (n.age >= NUMBER_MS) n.live = false;
    }
    for (let team = 0; team < this.combos.length; team++) {
      const c = this.combos[team];
      if (!c) continue;
      const h = hits[team] ?? 0;
      c.pop += ms;
      if (h >= COMBO_MIN_HITS) {
        if (h !== c.hits && COMBO_MILESTONES.includes(h)) c.pop = 0;
        c.hits = h;
        c.damage = damage[team] ?? 0;
        c.hold = COMBO_HOLD_MS;
      } else if (c.hits > 0) {
        c.hold -= ms;
        if (c.hold <= 0) c.hits = 0;
      }
    }
  }
}

const NO_METER: readonly number[] = [0, 0];

/** Full bars in a meter value. */
export function meterBarsOf(value: number): number {
  return Math.min(METER_BARS, Math.floor(value / METER_BAR));
}

/** The meter in words (never colour alone): MAX when full, the bar count once a bar is full, else the percent of the first bar, the same unit as the action bar's "Super 8%". */
export function meterLabel(value: number): string {
  const bars = meterBarsOf(value);
  if (bars >= METER_BARS) return `${String(bars)} MAX`;
  return bars === 0 ? `${String(Math.floor((Math.max(0, value) * 100) / METER_BAR))}%` : String(bars);
}

export interface MeterSegment {
  readonly x: number;
  /** Filled width in px (0..SEGMENT_W). */
  readonly fill: number;
  /** Full segments are solid; the one still filling is dashed (CHARGE_DASH). */
  readonly full: boolean;
}

/**
 * Centre y of the SUPER label: level with the segments, but lifted when the boosted phone text (height `textH`) would reach the
 * bench chips, whose top (minus the 2 px frame) is `chipTop`; a 3 px gap is kept, and the label never rises above `floorY`
 * (the life bar's lower edge). Pure.
 */
export function meterLabelY(mid: number, textH: number, chipTop: number, floorY: number): number {
  const lifted = Math.min(mid, chipTop - 2 - 3 - textH / 2);
  return Math.max(lifted, floorY + textH / 2);
}

/** Left edge of a side's meter: team 0 ends METER_INSET before `innerX` (its bar's end toward the centre), team 1 starts as far after it. */
export function meterX(team: number, innerX: number): number {
  return team === 0 ? innerX - METER_INSET - METER_W : innerX + METER_INSET;
}

/** The METER_BARS segments, filling left to right on both sides (one reading direction). */
export function meterSegments(value: number, x: number): MeterSegment[] {
  const out: MeterSegment[] = [];
  for (let i = 0; i < METER_BARS; i++) {
    const part = Math.min(METER_BAR, Math.max(0, value - i * METER_BAR));
    out.push({ x: x + i * (SEGMENT_W + SEGMENT_GAP), fill: Math.floor((part * SEGMENT_W) / METER_BAR), full: part === METER_BAR });
  }
  return out;
}

/** Fill opacity of the meter: steady unless full; a full meter dims for half of each METER_PULSE_MS (steady with reduced motion). */
export function meterFlashAlpha(m: MeterShown, reduced: boolean): number {
  if (reduced || meterBarsOf(m.value) < METER_BARS) return 1;
  return m.full % METER_PULSE_MS < METER_PULSE_MS / 2 ? 1 : 0.35;
}

/** Upward offset of a number at `age` ms; reduced motion fades it in place. */
export function numberRise(age: number, reduced: boolean): number {
  return reduced ? 0 : -NUMBER_RISE_PX * Math.min(1, age / NUMBER_MS);
}

/** Opacity of a number: full for the first half, then a fade. */
export function numberAlpha(age: number): number {
  const half = NUMBER_MS / 2;
  return age <= half ? 1 : Math.max(0, 1 - (age - half) / half);
}

/** Whole points, at least 1 for any real damage; a counter hit says so in words. */
export function numberLabel(amount: number, counter: boolean): string {
  const v = amount > 0 ? Math.max(1, Math.round(amount)) : 0;
  return counter ? `${String(v)} COUNTER` : String(v);
}

export function comboLabel(hits: number, damage: number): string {
  return `${String(hits)} HITS\n${String(Math.round(damage))} DMG`;
}

/** Scale of the combo text: a pop at the 3/5/8 milestones that settles over COMBO_POP_MS; none with reduced motion. */
export function comboScale(c: ComboShown, reduced: boolean): number {
  if (reduced || c.pop >= COMBO_POP_MS) return 1;
  return 1 + COMBO_POP_SCALE * (1 - c.pop / COMBO_POP_MS);
}

/** Opacity of the combo text: fades over the last 300 ms of the hold after the combo ends. */
export function comboAlpha(c: ComboShown): number {
  return Math.min(1, c.hold / 300);
}
