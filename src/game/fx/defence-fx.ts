import { CHARGE_TICKS, DASH_TICKS, SimEventKind, SnagEvent, type SimEvent } from '@core/index';
import type { Announcement } from '../a11y/announcer';

/**
 * Pure rules of the Arcade defence view (FUN-DESIGN 2.7, 2.8 and section 3, WP-arcade-defence-view): which effect each
 * defence event gives, and the timing and geometry the Phaser side (`defence-view.ts`) draws. No Phaser, no DOM, no
 * sim state: events in, sink calls out. Reduced motion keeps every cue that carries information (the text pops, the
 * parry flash, a static ring, a static spark, the shield and the guard bar) and drops motion (afterimages, trails,
 * flying sparks and shards, the expanding ring).
 */

/** View tick length in ms (50 Hz); effect lengths below are in view ticks, so they hold while the sim is paused. */
export const TICK_MS = 20;
/** Afterimage (and trail) alphas, newest first (FUN-DESIGN section 3: 0.5 / 0.3 / 0.15). */
export const AFTERIMAGE_ALPHA = [0.5, 0.3, 0.15] as const;
/** View ticks between two dash afterimages, and how long they fade after the dash. */
export const AFTERIMAGE_GAP = 2;
export const AFTERIMAGE_FADE = 6;
/** Chip sparks per guarded hit, guard-break shards, reflection sparks. */
export const CHIP_SPARKS = 6;
export const SHATTER_SHARDS = 14;
export const REFLECT_SPARKS = 8;
export const SPARK_TICKS = 12;
export const SHARD_TICKS = 25;
/** Parry flash, parry ping and the reduced-motion static ring, in view ticks. */
export const FLASH_TICKS = 6;
export const RING_TICKS = 13;
/** Text pop over a fighter ("PARRY", "GUARD BREAK", "DODGE"). */
export const POP_TICKS = 40;
/** Guard and parry colours: a pale blue shield and chip, a gold parry, an orange break (each with a word or shape too). */
export const GUARD_COLOR = 0x9fd8ff;
export const PARRY_COLOR = 0xffe066;
export const BREAK_COLOR = 0xff9a3c;
export const DODGE_COLOR = 0xffffff;
/** The guard bar turns BREAK_COLOR at or under this share of the meter (its width is the main cue). */
export const GUARD_LOW_PM = 300;

export const PARRY_WORD = 'PARRY';
export const BREAK_WORD = 'GUARD BREAK';
export const DODGE_WORD = 'DODGE';
export const CHARGE_WORD = 'CHARGE!';
/** Snag (FUN-DESIGN 2.20): a rope-brown root ring and word; fire burning it pops FREE in the break orange. */
export const ROPE_COLOR = 0xc8a060;
export const ROOTED_WORD = 'ROOTED';
export const FREED_WORD = 'FREE';

/** Live-region lines (through the Arena's throttled announcer), by whose fighter it was. */
export const LINES = {
  parryMine: { key: 'parry', text: 'You parried.', important: false },
  parryFoe: { key: 'parry', text: 'The enemy parried.', important: false },
  breakMine: { key: 'guardBreak', text: 'Your guard broke.', important: false },
  breakFoe: { key: 'guardBreak', text: 'Enemy guard broken.', important: false },
} as const satisfies Record<string, Announcement>;

/** Where the defence effects land; the Phaser implementation is in `defence-view.ts`. */
export interface DefenceSink {
  /** Dash afterimages behind fighter `id` from view tick `from` until `until` (normal motion only). */
  ghosts(id: number, from: number, until: number): void;
  /** `count` sparks flying out of entity `id` (a fighter or a projectile); count 1 with reduced motion is one static spark. */
  sparks(id: number, count: number, color: number, ticks: number, reduced: boolean): void;
  /** A ring on fighter `id`: expanding (the ping) or, with `reduced`, a static one. */
  ring(id: number, color: number, reduced: boolean): void;
  /** A short white flash over fighter `id` (no motion). */
  flash(id: number): void;
  /** A word over fighter `id`: floats up, or stays in place with `reduced`. */
  pop(id: number, word: string, color: number, reduced: boolean): void;
  say(line: Announcement): void;
}

export interface DefenceOptions {
  readonly reducedMotion: () => boolean;
  /** Team of a fighter (0 is the player), for the live-region wording. */
  readonly teamOf: (id: number) => number;
}

/**
 * Turns the five defence events into effects, once each: the Arena delivers every tick's events in order, so an event
 * at or before the last one seen (tick, then seq) is a re-delivery and is skipped (no allocation, unlike a key set).
 */
export class DefenceFx {
  private lastTick = -1;
  private lastSeq = -1;

  constructor(
    private readonly sink: DefenceSink,
    private readonly opts: DefenceOptions,
  ) {}

  consume(events: readonly SimEvent[]): void {
    for (const e of events) {
      const k = e.kind;
      if ((k < SimEventKind.guarded || k > SimEventKind.perfectDodge) && k !== SimEventKind.chargeStarted && k !== SimEventKind.snag) continue;
      if (e.tick < this.lastTick || (e.tick === this.lastTick && e.seq <= this.lastSeq)) continue;
      this.lastTick = e.tick;
      this.lastSeq = e.seq;
      this.one(e, k);
    }
  }

  private one(e: SimEvent, k: number): void {
    const sink = this.sink;
    const reduced = this.opts.reducedMotion();
    const target = e['target'] ?? -1;
    const mine = this.opts.teamOf(target) === 0;
    switch (k) {
      case SimEventKind.chargeStarted:
        // Speed lines are the afterimage trail (normal motion only); the word and the live-region line always show.
        if (!reduced) sink.ghosts(e.sourceId, e.tick, e.tick + CHARGE_TICKS);
        sink.pop(e.sourceId, CHARGE_WORD, BREAK_COLOR, reduced);
        sink.say({ key: 'charge', text: this.opts.teamOf(e.sourceId) === 0 ? 'You charged.' : 'The enemy charged.', important: false });
        break;
      case SimEventKind.snag:
        this.snag(e);
        break;
      case SimEventKind.dashed:
        if (!reduced) sink.ghosts(e.sourceId, e.tick, e.tick + DASH_TICKS);
        break;
      case SimEventKind.perfectDodge:
        sink.ring(e.sourceId, DODGE_COLOR, reduced);
        sink.pop(e.sourceId, DODGE_WORD, DODGE_COLOR, reduced);
        break;
      case SimEventKind.guarded:
        sink.sparks(target, reduced ? 1 : CHIP_SPARKS, GUARD_COLOR, SPARK_TICKS, reduced);
        break;
      case SimEventKind.parried:
        sink.flash(target);
        sink.ring(target, PARRY_COLOR, reduced);
        sink.pop(target, PARRY_WORD, PARRY_COLOR, reduced);
        // The reflected projectile is the event's source: a spark where it turns.
        if (e['reflected'] === 1) sink.sparks(e.sourceId, reduced ? 1 : REFLECT_SPARKS, PARRY_COLOR, SPARK_TICKS, reduced);
        sink.say(mine ? LINES.parryMine : LINES.parryFoe);
        break;
      default: // guardBroken
        sink.sparks(target, reduced ? 1 : SHATTER_SHARDS, GUARD_COLOR, SHARD_TICKS, reduced);
        sink.ring(target, BREAK_COLOR, reduced);
        sink.pop(target, BREAK_WORD, BREAK_COLOR, reduced);
        sink.say(mine ? LINES.breakMine : LINES.breakFoe);
    }
  }

  /** A Snag rooted (ring, word, line), was guarded (chip sparks) or burnt free (sparks, word); an expiry shows nothing. */
  private snag(e: SimEvent): void {
    const sink = this.sink;
    const reduced = this.opts.reducedMotion();
    const id = e['id'] ?? -1;
    const reason = e['reason'];
    if (reason === SnagEvent.rooted) {
      sink.ring(id, ROPE_COLOR, reduced);
      sink.pop(id, ROOTED_WORD, ROPE_COLOR, reduced);
      sink.say({ key: 'snag', text: this.opts.teamOf(id) === 0 ? 'You are rooted.' : 'Enemy rooted.', important: false });
    } else if (reason === SnagEvent.guarded) sink.sparks(id, reduced ? 1 : CHIP_SPARKS, GUARD_COLOR, SPARK_TICKS, reduced);
    else if (reason === SnagEvent.freed) {
      sink.sparks(id, reduced ? 1 : CHIP_SPARKS, BREAK_COLOR, SPARK_TICKS, reduced);
      sink.pop(id, FREED_WORD, BREAK_COLOR, reduced);
    }
  }
}

/** 0..1 progress of an effect started at view time `from` (ticks, fractional) lasting `ticks`, at time `t`. */
export function progress(t: number, from: number, ticks: number): number {
  return Math.min(1, Math.max(0, (t - from) / ticks));
}

/** Ring radius in px at progress `p` (0..1) for a fighter of size `size`: grows 0.5x..1.4x, or holds 1x when reduced. */
export function ringRadius(p: number, size: number, reduced: boolean): number {
  return reduced ? size : size * (0.5 + 0.9 * (1 - (1 - p) * (1 - p)));
}

/** Pop rise in px at progress `p`: 24 px up with an ease-out, none when reduced. */
export function popRise(p: number, reduced: boolean): number {
  return reduced ? 0 : 24 * (1 - (1 - p) * (1 - p));
}

/** Pops fade over their last third. */
export function popAlpha(p: number): number {
  return p < 2 / 3 ? 1 : 3 * (1 - p);
}

/** Dash afterimage alpha `k` (0 newest) at view time `t` of a dash ending at `until`: full during it, fading after. */
export function ghostAlpha(k: number, t: number, until: number): number {
  return (AFTERIMAGE_ALPHA[k] ?? 0) * (1 - progress(t, until, AFTERIMAGE_FADE));
}

/** Guard bar fill width for `meter` (0..GUARD_MAX `max`) in a bar `w` px wide. */
export function guardFill(meter: number, max: number, w: number): number {
  return Math.max(0, Math.min(w, Math.round((meter * w) / max)));
}
