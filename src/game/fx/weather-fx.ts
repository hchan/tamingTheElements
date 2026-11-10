import { SimEventKind, WEATHER_CHARGE_FULL, WEATHER_ELEMENTS, WEATHER_TICKS, type SimEvent } from '@core/index';
import type { Announcement } from '../a11y/announcer';

/**
 * Pure rules of the Arcade weather view (FUN-DESIGN 2.14 and section 3, WP-arcade-weather-view): what each weather event
 * gives, and the words, colours, timing and particle paths the Phaser side (`weather-view.ts`) draws. No Phaser, no DOM,
 * no sim state: events in, sink calls out. Weather kinds are the sim's (`Weather`: 1 Sun ... 5 Eclipse); every table
 * here is indexed by kind - 1. Reduced motion keeps every cue that carries information (the HUD badge with its word,
 * glyph and time bar, the called line, a static sky tint, the live-region lines) and drops motion (particles, the tint
 * fade and the line's scale-in).
 */

/** View tick length in ms (50 Hz); effect lengths below are in view ticks, so they hold while the sim is paused. */
export const TICK_MS = 20;

/** Names in live-region lines and the announcer-style called line ("Sunshine!"). */
export const WEATHER_NAMES = ['Sunshine', 'Rain', 'Sandstorm', 'Gale', 'Eclipse'] as const;
/** The HUD badge word (with the seconds left beside it): the badge reads by word and glyph, never by colour alone. */
export const BADGE_WORDS = ['SUN', 'RAIN', 'SAND', 'GALE', 'ECLIPSE'] as const;
/** Badge and called-line colour per weather. */
export const WEATHER_COLORS = [0xffc23d, 0x6fb7ff, 0xd9b26f, 0xc8f0ff, 0xb48cff] as const;
/** Light sky tint per weather (colour, alpha); Eclipse dims the arena instead. */
export const SKY_TINTS = [
  [0xffa830, 0.13], [0x1f4f8f, 0.2], [0xb88a4a, 0.2], [0xd8f2ff, 0.12], [0x0c0418, 0.38],
] as const;
/** Particles per weather: sun rays, rain streaks, sand grains, wind streaks, eclipse motes. */
export const PARTICLE_COUNTS = [5, 28, 32, 12, 10] as const;
export const MAX_PARTICLES = 32;

/** The called line: shown this long, scaled in from CALL_IN_SCALE over CALL_IN_TICKS, faded over the last CALL_OUT_TICKS. */
export const CALL_TICKS = 75;
export const CALL_IN_TICKS = 15;
export const CALL_IN_SCALE = 1.8;
export const CALL_OUT_TICKS = 15;
/** The sky tint fades in over this many view ticks after a cast and out over the last game ticks of the weather. */
export const TINT_RAMP_TICKS = 25;

/** Arena size (logical px) the particles cover. */
const W = 1280;
const H = 720;

/**
 * Live-region line when a team calls weather `kind` (team 0 is the player). Keys differ per weather, side and kind of
 * line, so a quick counter-weather is spoken too (the announcer drops a repeated key within a few seconds).
 */
export function changedLine(kind: number, mine: boolean, refresh: boolean): Announcement {
  const name = WEATHER_NAMES[kind - 1] ?? 'Weather';
  const who = mine ? 'You' : 'The enemy';
  const key = `weather${refresh ? 'Renew' : ''}${String(kind)}${mine ? 'Mine' : 'Foe'}`;
  if (refresh) return { key, text: `${who} renewed the ${name}.`, important: false };
  const [up, down] = WEATHER_ELEMENTS[kind - 1] ?? ['void', null];
  const effect = down === null ? `${up} hits harder` : `${up} hits harder, ${down} softer`;
  return { key, text: `${who} called ${name}: ${effect}.`, important: false };
}

export function endedLine(kind: number): Announcement {
  return { key: `weatherEnd${String(kind)}`, text: `The ${WEATHER_NAMES[kind - 1] ?? 'weather'} is over.`, important: false };
}

/** Where the weather effects land; the Phaser implementation is in `weather-view.ts`. */
export interface WeatherSink {
  /** Weather `kind` starts now (a new one or a replacement, not a refresh): the sky tint fades in from here. */
  start(kind: number): void;
  /** The called line ("Sunshine!") for `kind`: scales in, or shows at full size with `reduced`. */
  call(kind: number, reduced: boolean): void;
  /** Weather `kind` ended (the badge, tint and particles follow `RenderView.arcade().weather` and go with it). */
  end(kind: number): void;
  say(line: Announcement): void;
}

/**
 * Turns `weatherChanged` and `weatherEnded` into effects, once each: the Arena delivers every tick's events in order,
 * so an event at or before the last one seen (tick, then seq) is a re-delivery and is skipped.
 */
export class WeatherFx {
  private lastTick = -1;
  private lastSeq = -1;

  constructor(
    private readonly sink: WeatherSink,
    private readonly reducedMotion: () => boolean,
  ) {}

  consume(events: readonly SimEvent[]): void {
    for (const e of events) {
      if (e.kind !== SimEventKind.weatherChanged && e.kind !== SimEventKind.weatherEnded) continue;
      if (e.tick < this.lastTick || (e.tick === this.lastTick && e.seq <= this.lastSeq)) continue;
      this.lastTick = e.tick;
      this.lastSeq = e.seq;
      const kind = e['weather'] ?? 0;
      if (e.kind === SimEventKind.weatherEnded) {
        this.sink.end(kind);
        this.sink.say(endedLine(kind));
        continue;
      }
      const refresh = e['prev'] === kind;
      if (!refresh) this.sink.start(kind);
      this.sink.call(kind, this.reducedMotion());
      this.sink.say(changedLine(kind, e['team'] === 0, refresh));
    }
  }
}

/** 0..1 progress of an effect started at view time `from` (ticks, fractional) lasting `ticks`, at time `t`. */
export function progress(t: number, from: number, ticks: number): number {
  return Math.min(1, Math.max(0, (t - from) / ticks));
}

/** Called-line scale at progress `p`: CALL_IN_SCALE down to 1 over its first CALL_IN_TICKS (ease-out), 1 when reduced. */
export function callScale(p: number, reduced: boolean): number {
  const q = Math.min(1, (p * CALL_TICKS) / CALL_IN_TICKS);
  return reduced ? 1 : 1 + (CALL_IN_SCALE - 1) * (1 - q) * (1 - q);
}

/** Called-line alpha at progress `p`: full, then fading over the last CALL_OUT_TICKS. */
export function callAlpha(p: number): number {
  return Math.min(1, ((1 - p) * CALL_TICKS) / CALL_OUT_TICKS);
}

/**
 * Sky tint alpha for weather `kind` `since` view ticks after its cast with `left` game ticks to go: it fades in after
 * the cast and out at the end; reduced motion holds it steady.
 */
export function tintAlpha(kind: number, since: number, left: number, reduced: boolean): number {
  const base = SKY_TINTS[kind - 1]?.[1] ?? 0;
  if (left <= 0) return 0;
  return reduced ? base : base * Math.min(1, Math.max(0, since) / TINT_RAMP_TICKS, left / TINT_RAMP_TICKS);
}

/** HUD badge text: the weather word and the whole seconds left ("RAIN 10"). */
export function badgeLabel(kind: number, left: number): string {
  return `${BADGE_WORDS[kind - 1] ?? ''} ${String(Math.ceil(Math.max(0, left) / 50))}`;
}

/** Time-bar fill in px of a bar `w` px wide with `left` game ticks of WEATHER_TICKS to go. */
export function badgeFill(left: number, w: number): number {
  return Math.max(0, Math.min(w, Math.round((left * w) / WEATHER_TICKS)));
}

/**
 * Weather-charge chip text (WP-arcade-weather-charge): "WEATHER 60%" while it fills (whole percent, rounded down, so a
 * bar one short of full never reads 100%), "WEATHER READY" once the cast is unlocked. Words, not colour alone.
 */
export function chargeLabel(pm: number): string {
  return pm >= WEATHER_CHARGE_FULL ? 'WEATHER READY' : `WEATHER ${String(Math.floor((Math.max(0, pm) * 100) / WEATHER_CHARGE_FULL))}%`;
}

/** Charge-bar fill in px of a bar `w` px wide. */
export function chargeFill(pm: number, w: number): number {
  return Math.max(0, Math.min(w, Math.floor((pm * w) / WEATHER_CHARGE_FULL)));
}

/** READY border alpha at view time `t`: it blinks every 15 view ticks, steady when reduced motion is on. */
export function readyAlpha(t: number, reduced: boolean): number {
  return reduced || Math.floor(t / 15) % 2 === 0 ? 1 : 0.35;
}

/** One particle as drawn: a line from (x, y) by (dx, dy), or a dot of radius `r` when dx and dy are 0; alpha `a`. */
export interface Particle {
  x: number;
  y: number;
  dx: number;
  dy: number;
  r: number;
  a: number;
}

const frac = (v: number): number => v - Math.floor(v);
const wrap = (v: number, span: number): number => frac(v / span) * span;

/**
 * Particle `i` of weather `kind` at view time `t` (ticks) into `out` (no allocation): a cosmetic, repeatable path from
 * the index alone (the R2 low-discrepancy spread, no RNG). Sun: five wide rays from the top-left corner, swaying; rain: streaks
 * falling and slanting left; sand: grains blown to the right with a wobble; gale: long wind streaks; eclipse: dark
 * motes rising.
 */
export function particle(kind: number, i: number, t: number, out: Particle): void {
  const u = frac(0.5 + i * 0.7548777);
  const v = frac(0.5 + i * 0.5698403);
  out.dx = 0;
  out.dy = 0;
  out.r = 0;
  switch (kind) {
    case 1: {
      const ang = 0.18 + i * 0.26 + 0.04 * Math.sin(t * 0.03 + i);
      out.x = -40;
      out.y = -40;
      out.dx = Math.cos(ang) * 1100;
      out.dy = Math.sin(ang) * 1100;
      out.r = 26 + 10 * u;
      out.a = 0.1 + 0.05 * Math.sin(t * 0.05 + i * 1.7);
      break;
    }
    case 2:
      out.x = wrap(u * 1440 - 6 * t, 1440) - 80;
      out.y = wrap(v * (H + 40) + 22 * t, H + 40) - 30;
      out.dx = -5;
      out.dy = 20;
      out.a = 0.75;
      break;
    case 3:
      out.x = wrap(u * (W + 40) + 9 * t, W + 40) - 20;
      out.y = v * H + 10 * Math.sin(t * 0.08 + i);
      out.r = 2 + 2 * v;
      out.a = 0.85;
      break;
    case 4:
      out.x = wrap(u * 1600 + 32 * t, 1600) - 220;
      out.y = 40 + v * (H - 80);
      out.dx = 90 + 80 * v;
      out.dy = -3;
      out.a = 0.7;
      break;
    default:
      out.x = u * W;
      out.y = wrap(v * (H + 20) - 1.5 * t, H + 20) - 10;
      out.r = 3 + 3 * u;
      out.a = 0.45;
  }
}
