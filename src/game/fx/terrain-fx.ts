import { SimEventKind, type SimEvent } from '@core/index';
import type { Announcement } from '../a11y/announcer';

/**
 * Pure rules of the Arcade terrain view (FUN-DESIGN 2.15 and section 3, WP-arcade-terrain-view): what each terrain event
 * gives, and the words, colours, timing and particle paths the Phaser side (`terrain-view.ts`) draws. No Phaser, no DOM,
 * no sim state: events in, sink calls out. Stage kinds are the sim's weather kinds (1 fire, 2 water, 3 earth, 4 air);
 * every table here is indexed by kind - 1. Reduced motion keeps every cue that carries information (the patterns, the
 * word labels, the buff badge, the block spark, the live-region lines) and drops motion (particles, the glow pulse, the
 * fades and the spark's growth).
 */

/** View tick length in ms (50 Hz); effect lengths below are in view ticks, so they hold while the sim is paused. */
export const TICK_MS = 20;

/** The stage's element: also the backdrop texture suffix (`bg:fire`). */
export const STAGE_ELEMENTS = ['fire', 'water', 'earth', 'air'] as const;
export const STAGE_NAMES = ['fire', 'water', 'earth', 'air'] as const;
/** The word on a patch (with the pattern, so the cue is never colour alone). */
export const PATCH_WORDS = ['FIRE x2', 'WATER +HP', 'ROCK', 'AIR x2'] as const;
/** The HUD buff badge for a hero standing in a patch of its own element. */
export const BUFF_WORDS = ['FIRE x2', 'HEAL', 'ROCK PASS', 'AIR x2'] as const;
/** Patch colour per stage: fire orange, water blue, earth tan, air pale cyan. */
export const PATCH_COLORS = [0xff7a1a, 0x3aa0ff, 0xc89650, 0xc8f0ff] as const;
/** A darker colour of the same family for pattern strokes. */
export const PATCH_DARK = [0x8f2a00, 0x0b3f7a, 0x4a3016, 0x4a7f95] as const;

/** The telegraph of a stage swap and the fade-in of the new layout, in view ticks (the sim's TERRAIN_TELEGRAPH_TICKS). */
export const SWAP_TICKS = 30;
/** Old patches fade to this alpha while a swap is pending (a rock still blocks until it lands), then the new ones fade in from it. */
export const SWAP_FLOOR = 0.35;
/** Reduced motion holds the telegraph at this alpha (no fade). */
export const REDUCED_TELEGRAPH_ALPHA = 0.5;

export const MAX_PATCHES = 5;
/** Ambient particles per patch, and spark pool size. */
export const PARTICLES_PER_PATCH = 4;
export const MAX_PARTICLES = MAX_PATCHES * PARTICLES_PER_PATCH;
export const MAX_SPARKS = 6;
/** A block spark lives this many view ticks. */
export const SPARK_TICKS = 14;

/** Live-region line when the stage turns to `stage` (the swap has landed; `from` 0 is the first layout of the match). */
export function changedLine(stage: number, from: number): Announcement {
  const name = STAGE_NAMES[stage - 1] ?? 'plain';
  return {
    key: `stage${String(stage)}`,
    text: from === 0 ? `The stage is ${name}.` : `The stage turns to ${name}.`,
    important: false,
  };
}

/** Live-region line at the start of the 30-tick telegraph. */
export function swapLine(stage: number): Announcement {
  return { key: `stageSwap${String(stage)}`, text: `The stage will turn to ${STAGE_NAMES[stage - 1] ?? 'plain'}.`, important: false };
}

export const BLOCKED_LINE: Announcement = { key: 'rockBlock', text: 'Rock blocks the shot.', important: false };

/** The player standing on a patch of its own element: what it gives. */
export function enteredLine(stage: number): Announcement {
  const gives = ['damage doubled', 'healing', 'rocks do not stop you', 'speed doubled'][stage - 1] ?? 'a bonus';
  return { key: `patchIn${String(stage)}`, text: `You stand on a ${STAGE_NAMES[stage - 1] ?? ''} patch: ${gives}.`, important: false };
}

/** Where the terrain effects land; the Phaser implementation is in `terrain-view.ts`. */
export interface TerrainSink {
  /** A swap to `stage` starts its telegraph (`ticks` long). */
  swap(stage: number, ticks: number): void;
  /** A new layout of `count` patches is up for `stage` (`from`: the stage before, 0 for the first layout). */
  changed(stage: number, count: number, from: number): void;
  /** A projectile was stopped by a rock at (x, y). */
  blocked(x: number, y: number): void;
  /** A hero of `team` stepped on (`on`) or off a patch of its element. */
  stood(team: number, stage: number, on: boolean): void;
  /** A water hero healed `amount` HP. */
  healed(amount: number): void;
  say(line: Announcement): void;
}

/**
 * Turns the six terrain events into effects, once each: the Arena delivers every tick's events in order, so an event at
 * or before the last one seen (tick, then seq) is a re-delivery and is skipped.
 */
export class TerrainFx {
  private lastTick = -1;
  private lastSeq = -1;
  private stage = 0;

  constructor(private readonly sink: TerrainSink) {}

  /** The stage drawn before any event (a view that mounts after the layout was drawn). */
  start(stage: number): void {
    this.stage = stage;
  }

  consume(events: readonly SimEvent[]): void {
    for (const e of events) {
      if (e.kind < SimEventKind.terrainChanged || e.kind > SimEventKind.projectileBlocked) continue;
      if (e.tick < this.lastTick || (e.tick === this.lastTick && e.seq <= this.lastSeq)) continue;
      this.lastTick = e.tick;
      this.lastSeq = e.seq;
      switch (e.kind) {
        case SimEventKind.terrainSwap:
          this.sink.swap(e['stage'] ?? 0, e['ticks'] ?? SWAP_TICKS);
          this.sink.say(swapLine(e['stage'] ?? 0));
          break;
        case SimEventKind.terrainChanged: {
          const stage = e['stage'] ?? 0;
          const from = this.stage;
          this.stage = stage;
          this.sink.changed(stage, e['count'] ?? 0, from);
          // A new layout of the same stage (a round start) is silent.
          if (stage !== from) this.sink.say(changedLine(stage, from));
          break;
        }
        case SimEventKind.projectileBlocked:
          this.sink.blocked(e['x'] ?? 0, e['y'] ?? 0);
          this.sink.say(BLOCKED_LINE);
          break;
        case SimEventKind.patchEntered:
        case SimEventKind.patchLeft: {
          const on = e.kind === SimEventKind.patchEntered;
          this.sink.stood(e['team'] ?? 0, e['stage'] ?? 0, on);
          if (on && e['team'] === 0) this.sink.say(enteredLine(e['stage'] ?? 0));
          break;
        }
        default:
          this.sink.healed(e['amount'] ?? 0);
      }
    }
  }
}

/** 0..1 progress of an effect started at view time `from` (ticks, fractional) lasting `ticks`, at time `t`. */
export function progress(t: number, from: number, ticks: number): number {
  return Math.min(1, Math.max(0, (t - from) / ticks));
}

/**
 * Patch alpha: 1 normally; while a swap is pending (`swapLeft` game ticks to go) it fades towards SWAP_FLOOR; a new
 * layout (`since` view ticks after it landed) fades in from SWAP_FLOOR. Reduced motion holds REDUCED_TELEGRAPH_ALPHA
 * during the telegraph and shows a new layout at full strength at once.
 */
export function patchAlpha(swapLeft: number, since: number, reduced: boolean): number {
  if (swapLeft > 0) return reduced ? REDUCED_TELEGRAPH_ALPHA : 1 - (1 - SWAP_FLOOR) * progress(SWAP_TICKS - swapLeft, 0, SWAP_TICKS);
  if (reduced) return 1;
  return SWAP_FLOOR + (1 - SWAP_FLOOR) * progress(since, 0, SWAP_TICKS);
}

/** Backdrop alpha of the image of the stage the swap heads for: it fades in over the telegraph (0 when none pending). */
export function nextBackdropAlpha(swapLeft: number, reduced: boolean): number {
  if (swapLeft <= 0) return 0;
  return reduced ? 0 : progress(SWAP_TICKS - swapLeft, 0, SWAP_TICKS);
}

/** Glow alpha: a slow pulse around `base`, steady with reduced motion. */
export function glowAlpha(clock: number, base: number, reduced: boolean): number {
  if (reduced) return base;
  const ph = (clock % 100) / 100;
  return base * (0.75 + 0.5 * (ph < 0.5 ? ph * 2 : 2 - ph * 2));
}

/** True when the point (x, y) is inside patch `i` of the flat `patches` array of 4-int rectangles. */
export function inPatch(patches: readonly number[], count: number, x: number, y: number): boolean {
  for (let i = 0; i < count; i++) {
    const px = patches[i * 4] ?? 0;
    const py = patches[i * 4 + 1] ?? 0;
    if (x >= px && x < px + (patches[i * 4 + 2] ?? 0) && y >= py && y < py + (patches[i * 4 + 3] ?? 0)) return true;
  }
  return false;
}

/**
 * The buff badge text for a hero of element index `heroStage` (1 fire .. 4 air, 0 other) at (x, y) on `stage`, or ''
 * when no buff applies (the sim gives the effect only to a hero of the stage's element inside a patch).
 */
export function badgeText(stage: number, heroStage: number, patches: readonly number[], count: number, x: number, y: number): string {
  if (stage < 1 || stage > 4 || heroStage !== stage || !inPatch(patches, count, x, y)) return '';
  return BUFF_WORDS[stage - 1] ?? '';
}

/** One reused particle, in logical px. */
export interface Particle {
  x: number;
  y: number;
  /** Length of a wind streak (0 for a round particle) and the radius of a round one. */
  len: number;
  r: number;
  a: number;
}

/**
 * Ambient particle `i` (0..PARTICLES_PER_PATCH-1) of patch (px, py, w, h) at view time `t`, written to `out`: fire embers
 * rise and fade, water droplets leap and fall, earth dust drifts along the base, air streaks slide across and wrap.
 * Positions are a fixed function of `t` and the patch index `k`, so they hold while the sim is paused.
 */
export function particle(stage: number, k: number, i: number, t: number, px: number, py: number, w: number, h: number, out: Particle): Particle {
  const seed = ((k * 7 + i * 3 + 1) * 0.6180339887) % 1;
  const speed = [0.012, 0.015, 0.006, 0.02][stage - 1] ?? 0.01;
  const ph = (t * speed + seed * 3.7 + i * 0.27) % 1;
  const col = (seed * 997) % 1;
  out.x = px + w * (0.1 + 0.8 * col);
  out.len = 0;
  out.r = 0;
  out.a = 0.9;
  switch (stage) {
    case 1:
      out.y = py + h * (1 - ph);
      out.r = 3 - ph * 1.5;
      out.a = 1 - ph;
      break;
    case 2: {
      const up = ph < 0.5 ? ph * 2 : 2 - ph * 2;
      out.y = py + h * (0.9 - 0.5 * up * (2 - up));
      out.r = 3;
      out.a = 0.9;
      break;
    }
    case 3:
      out.x = px + w * ph;
      out.y = py + h * (0.8 + 0.15 * col);
      out.r = 2.5;
      out.a = 0.8 * Math.min(1, ph * 5, (1 - ph) * 5);
      break;
    default:
      out.x = px + w * ph - 14;
      out.y = py + h * (0.15 + 0.7 * col);
      out.len = 28;
      out.a = 0.9 * Math.min(1, ph * 5, (1 - ph) * 5);
  }
  return out;
}
