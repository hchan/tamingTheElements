/**
 * Status animation model shared by the hero view (status-fx-view.ts) and the HUD chips (Hud.ts): one look per StatusId (muted
 * colour plus a non-colour icon shape), the apply / expiry / low-time timing curves and a tracker that notices a status being
 * applied or ending. Pure (no Phaser), tick-based so it holds while paused. Reduced motion keeps every cue but drops the motion:
 * the apply burst and expiry fade become short static fades.
 *
 * Not statuses in the sim: burn (fire only burns a Snag rope) and Fire Heal (an action-bar pop); the root has its own rope view.
 */

export interface StatusLook {
  readonly label: string;
  readonly hostile: boolean;
  /** Muted 0xRRGGBB, graded like the baked sprites. */
  readonly color: number;
  /** Unit-square polyline (x,y pairs in -1..1) drawn as the icon: the shape codes the status without colour. */
  readonly icon: readonly number[];
  /** Closed outline (true) or open stroke. */
  readonly closed: boolean;
}

const hex = (n: number, r = 1): number[] => {
  const o: number[] = [];
  for (let i = 0; i < n; i++) o.push(Math.cos((i / n) * Math.PI * 2 - Math.PI / 2) * r, Math.sin((i / n) * Math.PI * 2 - Math.PI / 2) * r);
  return o;
};

/** Keyed by StatusId (adrenaline 1 .. superSlow 9). Distinct silhouettes: bolt, flame, plate, veil ring, spokes, weight, streaks, shield, waves. */
export const STATUS_LOOKS: Readonly<Record<number, StatusLook>> = {
  1: { label: 'RUSH', hostile: false, color: 0x9a8a52, closed: false, icon: [-0.3, -1, 0.5, -0.1, -0.1, 0.05, 0.4, 1] },
  2: { label: 'FIRE', hostile: false, color: 0xa4573a, closed: true, icon: [0, -1, 0.55, -0.1, 0.4, 0.7, 0, 1, -0.4, 0.7, -0.55, -0.1] },
  3: { label: 'ROCK', hostile: false, color: 0x8a7a5e, closed: true, icon: [0, -1, 0.9, -0.3, 0.6, 0.9, -0.6, 0.9, -0.9, -0.3] },
  4: { label: 'VEIL', hostile: false, color: 0x7e8c94, closed: true, icon: hex(8, 0.9) },
  5: { label: 'FREEZE', hostile: true, color: 0x7f9aa6, closed: false, icon: [0, -1, 0, 1, -0.87, -0.5, 0.87, 0.5, -0.87, 0.5, 0.87, -0.5] },
  6: { label: 'SLOW', hostile: true, color: 0x6f8296, closed: false, icon: [-0.8, -0.7, 0, 0, 0.8, -0.7, -0.8, 0.1, 0, 0.8, 0.8, 0.1] },
  7: { label: 'FAST', hostile: false, color: 0x8f9a6a, closed: false, icon: [-0.9, -0.8, -0.1, 0, -0.9, 0.8, 0, -0.8, 0.8, 0, 0, 0.8] },
  8: { label: 'GUARD', hostile: false, color: 0x86806a, closed: true, icon: [-0.8, -0.8, 0.8, -0.8, 0.8, 0.1, 0, 1, -0.8, 0.1] },
  9: { label: 'TIDE', hostile: true, color: 0x5f7f86, closed: false, icon: [-1, -0.2, -0.5, -0.7, 0, -0.2, 0.5, -0.7, 1, -0.2, -1, 0.6, -0.5, 0.1, 0, 0.6, 0.5, 0.1, 1, 0.6] },
};
/** Root (Snag) icon, used by the HUD chip. */
export const ROOT_ICON: readonly number[] = [-0.9, -0.5, 0.9, 0.5, 0.9, -0.5, -0.9, 0.5];

export const BURST_TICKS = 16;
export const EXPIRE_TICKS = 20;
/** The last stretch of a status blinks (1 s at 50 Hz). */
export const LOW_TICKS = 50;
export const REDUCED_BURST_TICKS = 10;

export interface Burst {
  /** 0..1 ring expansion. */
  readonly t: number;
  readonly alpha: number;
}

/** Apply burst at `age` ticks since applied, or undefined once over. Reduced motion: no expansion, a short fade. */
export function burstLook(age: number, reduced: boolean): Burst | undefined {
  const len = reduced ? REDUCED_BURST_TICKS : BURST_TICKS;
  if (age < 0 || age >= len) return undefined;
  const u = age / len;
  return { t: reduced ? 0.6 : 1 - (1 - u) * (1 - u), alpha: reduced ? 0.7 * (1 - u) : 0.9 * (1 - u) };
}

/** Expiry fade: alpha 0..1 at `age` ticks since it ended; undefined once gone. */
export function expireLook(age: number, reduced: boolean): { alpha: number; rise: number } | undefined {
  const len = reduced ? REDUCED_BURST_TICKS : EXPIRE_TICKS;
  if (age < 0 || age >= len) return undefined;
  const u = age / len;
  return { alpha: 0.8 * (1 - u), rise: reduced ? 0 : u };
}

/** Loop alpha for an aura: ramps in over 10 ticks, blinks in the last second (steady dimmer pulse under reduced motion). */
export function loopAlpha(age: number, remaining: number, reduced: boolean): number {
  let a = Math.min(1, Math.max(0, age / 10));
  if (remaining < LOW_TICKS) a *= reduced ? 0.55 : 0.55 + 0.45 * (Math.sin(remaining * 0.5) * 0.5 + 0.5);
  return Math.max(0, a);
}

/** Fraction of the timer ring still full (1 at apply, 0 at expiry). */
export function ringFraction(now: number, start: number, expire: number): number {
  const span = expire - start;
  if (span <= 0) return 0;
  return Math.min(1, Math.max(0, (expire - now) / span));
}

/** HUD chip scale: a short pop on apply (1.25 -> 1), none under reduced motion. */
export function chipPop(age: number, reduced: boolean): number {
  if (reduced || age < 0 || age >= 10) return 1;
  return 1 + 0.25 * (1 - age / 10) * (1 - age / 10);
}

/** HUD chip flash 0..1: bright at apply and at expiry, fading over 12 ticks (a shorter, dimmer flash under reduced motion). */
export function chipFlash(age: number, reduced: boolean): number {
  const len = reduced ? 6 : 12;
  if (age < 0 || age >= len) return 0;
  return (reduced ? 0.5 : 0.8) * (1 - age / len);
}

/** Blink on/off for the low-time chip (steady under reduced motion). */
export function chipBlink(remaining: number, reduced: boolean): boolean {
  return remaining >= LOW_TICKS || reduced || Math.floor(remaining / 6) % 2 === 0;
}

export interface Tracked<T> {
  readonly key: string;
  readonly payload: T;
  readonly born: number;
  readonly start: number;
  readonly expire: number;
}

export interface Gone<T> {
  readonly key: string;
  readonly payload: T;
  readonly at: number;
}

/**
 * Notices statuses coming and going between frames. The first `update` is "priming": what is already active gets no apply
 * burst (born = -Infinity). A status whose startTick changes (refreshed) counts as applied again. Gone entries live `keep`
 * ticks so the expiry fade can play.
 */
export class StatusTracker<T> {
  private live = new Map<string, Tracked<T>>();
  private primed = false;
  private goneList: Gone<T>[] = [];

  constructor(private readonly keep = EXPIRE_TICKS) {}

  /** Feed the current statuses for this frame; returns the live tracked entries. */
  update(now: number, current: ReadonlyMap<string, { payload: T; start: number; expire: number }>): readonly Tracked<T>[] {
    const next = new Map<string, Tracked<T>>();
    for (const [key, c] of current) {
      const prev = this.live.get(key);
      const born = prev && prev.start === c.start ? prev.born : this.primed ? now : Number.NEGATIVE_INFINITY;
      next.set(key, { key, payload: c.payload, born, start: c.start, expire: c.expire });
    }
    for (const [key, p] of this.live) if (!next.has(key)) this.goneList.push({ key, payload: p.payload, at: now });
    this.goneList = this.goneList.filter((g) => now - g.at < this.keep && now >= g.at);
    this.live = next;
    this.primed = true;
    return [...next.values()];
  }

  /** Statuses that ended within the keep window, with `at` = the tick they were seen gone. */
  gone(): readonly Gone<T>[] {
    return this.goneList;
  }

  clear(): void {
    this.live.clear();
    this.goneList = [];
    this.primed = false;
  }
}
