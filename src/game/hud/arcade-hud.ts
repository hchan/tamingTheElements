/**
 * Pure Arcade HUD model (no Phaser): pooled floating damage numbers and the per-team combo counter
 * (docs/FUN-DESIGN.md section 3). The Arena feeds it and ages it while the sim runs; the Hud scene only draws it.
 */

export const NUMBER_SLOTS = 16;
export const NUMBER_MS = 500;
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

  /** Advances by `ms`. `hits` and `damage` are the live combo per team (RenderView.arcade()). */
  update(ms: number, hits: readonly number[], damage: readonly number[]): void {
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
