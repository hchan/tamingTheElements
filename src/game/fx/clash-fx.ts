import { ELEMENTS, SimEventKind, type SimEvent } from '@core/index';
import { ELEMENT_COLORS } from './element-colors';

/**
 * Rules of the Arcade clash burst (WP-arcade-clash, FUN-DESIGN section 3 "Clash burst"), free of Phaser so fake sinks
 * test them: every `clash` event gives one two-colour ring at the overlap centre, the winner's element colour on top
 * (inner, thicker) of the loser's; a cancel (both destroyed) gives both colours at equal weight and a white core.
 */

/** Burst length in view ticks (20 ms each). */
export const BURST_TICKS = 18;
/** Ring radius in px: grows from BURST_FROM x to the full radius (an ease-out), or holds the full radius when reduced. */
export const BURST_R = 36;
export const BURST_FROM = 0.35;

export interface ClashSink {
  /** A ring at (x, y): `under` drawn first (outer), `over` on top (inner); `cancel` adds a white core; `flat`: no growth. */
  burst(x: number, y: number, under: number, over: number, cancel: boolean, flat: boolean): void;
}

const colorOf = (el: number): number => ELEMENT_COLORS[ELEMENTS[el] ?? 'void'];

/**
 * Turns `clash` events into bursts, once each: the Arena delivers every tick's events in order, so an event at or
 * before the last one seen (tick, then seq) is a re-delivery and is skipped (no allocation).
 */
export class ClashFx {
  private lastTick = -1;
  private lastSeq = -1;

  constructor(
    private readonly sink: ClashSink,
    private readonly reducedMotion: () => boolean,
  ) {}

  consume(events: readonly SimEvent[]): void {
    for (const e of events) {
      if (e.kind !== SimEventKind.clash) continue;
      if (e.tick < this.lastTick || (e.tick === this.lastTick && e.seq <= this.lastSeq)) continue;
      this.lastTick = e.tick;
      this.lastSeq = e.seq;
      const a = colorOf(e['ea'] ?? 4);
      const b = colorOf(e['eb'] ?? 4);
      // The winner's colour on top; a cancel keeps a over b.
      const bWon = e['winner'] === e['b'];
      this.sink.burst(e['x'] ?? 0, e['y'] ?? 0, bWon ? a : b, bWon ? b : a, e['winner'] === -1, this.reducedMotion());
    }
  }
}

/** Ring radius at progress `p` (0..1). */
export function burstRadius(p: number, flat: boolean): number {
  return flat ? BURST_R : BURST_R * (BURST_FROM + (1 - BURST_FROM) * (1 - (1 - p) * (1 - p)));
}

/** Full for the first half, then fading out (no motion, so reduced motion keeps it). */
export function burstAlpha(p: number): number {
  return p < 0.5 ? 1 : 2 * (1 - p);
}
