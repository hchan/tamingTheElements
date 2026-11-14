import type { Element } from '@core/index';
import { CHARACTERS, CHARACTER_TEXT, TAG_COOLDOWN_TICKS } from '@core/index';
import type { Announcement } from '../a11y/announcer';
import { elementGlyph } from './bars';

/**
 * Pure rules of the Arcade tag-team view (FUN-DESIGN 2.6 and section 3, WP-arcade-tag-view): the words, timing and shapes
 * the Phaser side (`tag-view.ts`) draws. No Phaser, no DOM, no sim state. Every cue has a word or a pattern, never colour
 * alone; reduced motion keeps every word, ring and bar and drops the slide, the ring's growth and the scale-in.
 */

/** Effect lengths in view ticks (50 Hz), so they hold while the sim is paused. */
export const FLASH_TICKS = 24;
export const CALL_TICKS = 60;
const CALL_IN_TICKS = 8;
const CALL_OUT_TICKS = 12;
const CALL_IN_SCALE = 1.6;
/** Red life ("recoverable" HP between the health and the rest cap): dashes over the grey rest stroke, as FUN-DESIGN 3. */
export const RED_DASH: readonly [number, number] = [6, 4];
export const RED_COLOR = 0xe0303a;
/** High contrast: Okabe-Ito reddish purple, apart from the blue, yellow and orange health fills. */
export const RED_COLOR_HC = 0xcc79a7;

/**
 * One HUD health bar as `bars.ts` lays it out (`mainBar`, `benchBar`, `sideOffset`; pinned by a test). Kept here because
 * importing `bars.ts` would grow the phaser-config chunk's export list over its size budget.
 */
export interface Bar {
  readonly minX: number;
  readonly maxX: number;
  readonly y: number;
  readonly line: number;
}

/** A side's block: team 0 on the left half of the 1280 px HUD, team 1 on the right. */
export const teamX = (team: number): number => team * 640;
/** The slim HUD's bars (`slim-hud.ts` `slimBar` and `chipBar`; a test pins the numbers). */
export const mainBarOf = (team: number): Bar => ({ minX: team === 0 ? 120 : 700, maxX: team === 0 ? 580 : 1160, y: 20, line: 16 });
export const benchBarOf = (team: number, i: number): Bar => {
  const x = team === 0 ? 506 - 4 - 68 - i * 72 : 1280 - (506 - 4 - 68 - i * 72) - 68;
  return { minX: x, maxX: x + 68, y: 131, line: 6 };
};

/** The tag-cooldown bar's size. */
export const TAG_BAR_W = 72;
export const TAG_BAR_H = 8;

/**
 * Where a side's tag lines go, as [x, y] from its first bench bar's start (x) and the HUD top (y), in line order (IN, the
 * BENCH lines, the tag word), and the tag bar's top left; `rowH` is a text row's height. Two heroes: three rows under the
 * bench bar. Three (3v3, WP-arcade-3v3): each BENCH line under its own bench bar, then a row with the tag bar, its word
 * and the IN line (the gold frame on the main bar shows who is in as well).
 */
export function tagLayout(heroes: number, rowH: number, boost: number): { readonly rows: [number, number][]; readonly bar: [number, number] } {
  const under = (i: number): number => 26 + i * 40 + 6;
  const word = TAG_BAR_W + 8;
  const barY = (y: number): number => y + (rowH - 5 - TAG_BAR_H) / 2;
  if (heroes < 3) return { rows: [[0, under(0)], [0, under(0) + rowH], [word, under(0) + 2 * rowH]], bar: [0, barY(under(0) + 2 * rowH)] };
  const y = under(1) + rowH;
  return { rows: [[word + Math.round(110 * boost), y], [0, under(0)], [0, under(1)], [word, y]], bar: [0, barY(y)] };
}

/** Splits [from, to] into [on, off] dashes, as `dashSegments`. */
export function dashes(from: number, to: number, [on, off]: readonly [number, number]): [number, number][] {
  const out: [number, number][] = [];
  for (let x = from; x < to; x += on + off) out.push([x, Math.min(to, x + on)]);
  return out;
}

/** The red-life span [health end, rest-cap end] on bar `b`, as `barFill` places its two strokes. */
export function redSpan(b: Bar, h: TagHero): [number, number] {
  const at = (v: number): number => Math.ceil((b.maxX - b.minX) * (h.maxHp > 0 ? Math.min(1, Math.max(0, v / h.maxHp)) : 0) + b.minX);
  return [at(h.hp), at(h.restCap)];
}

/** "Pax": the character's name from its sprite key (the render view carries sprites, not ids). */
export function heroName(sprite: string): string {
  const id = CHARACTERS.find((c) => c.sprite === sprite)?.id;
  return (id && CHARACTER_TEXT.get(id)?.name) ?? sprite;
}

const pct = (n: number, max: number): number => Math.ceil((Math.max(0, n) * 100) / Math.max(1, max));

/** One hero of a team as the tag view reads it off the render view. */
export interface TagHero {
  readonly sprite: string;
  readonly hp: number;
  readonly maxHp: number;
  readonly restCap: number;
  readonly dead: boolean;
  /** Shown as a glyph after the name (short, so the line still fits beside the round pips) so a benched hero's element is never colour alone. */
  readonly element?: Element;
}

/** Red life in per cent of max HP (0 when none). */
export const redPct = (h: TagHero): number => (h.dead || h.restCap <= h.hp ? 0 : pct(h.restCap - h.hp, h.maxHp));

/** The benched hero's line: "BENCH Pax 40% +20% red", or "BENCH Pax K.O.". */
export function benchLabel(h: TagHero): string {
  const name = h.element === undefined ? heroName(h.sprite) : `${heroName(h.sprite)} ${elementGlyph(h.element)}`;
  if (h.dead || h.hp <= 0) return `BENCH ${name} K.O.`;
  const red = redPct(h);
  return `BENCH ${name} ${String(pct(h.hp, h.maxHp))}%${red > 0 ? ` +${String(red)}% red` : ''}`;
}

/** The active hero's line: "IN Sindarosa". */
export const activeLabel = (sprite: string): string => `IN ${heroName(sprite)}`;

/**
 * Tag readiness from the game ticks left on the tag cooldown: the label ("TAG READY", "TAG 2.4s", "NO TAG" when every
 * bench hero is down) and the elapsed fraction (0..1) the cooldown bar fills to.
 */
export function tagReadout(left: number, partnerDown: boolean): { readonly label: string; readonly fill: number } {
  if (partnerDown) return { label: 'NO TAG', fill: 0 };
  if (left <= 0) return { label: 'TAG READY', fill: 1 };
  return { label: `TAG ${(left / 50).toFixed(1)}s`, fill: Math.max(0, 1 - left / TAG_COOLDOWN_TICKS) };
}

/** The announcer-style call: "TAG!" for a tag, "PAX IN!" for a KO entrance. */
export const callText = (to: string, ko: boolean): string => (ko ? `${heroName(to).toUpperCase()} IN!` : 'TAG!');

/** The live-region line for a tag (`team` 0 is the player) or a KO entrance. */
export function tagLine(team: number, from: string, to: string, ko: boolean): Announcement {
  const a = heroName(from);
  const b = heroName(to);
  const mine = team === 0;
  const text = ko
    ? `${mine ? '' : 'Enemy '}${a} is down. ${b} steps in.`
    : mine ? `Tag! ${b} is in, ${a} rests.` : `The enemy tagged in ${b}.`;
  return { key: `${ko ? 'koIn' : 'tag'}${String(team)}`, text, important: false };
}

/** The call's scale (scales in from 1.6x unless reduced) and alpha (fades out at the end) at view-tick age `t`. */
export function callPose(t: number, reduced: boolean): { readonly scale: number; readonly alpha: number } {
  const k = Math.min(1, t / CALL_IN_TICKS);
  return {
    scale: reduced ? 1 : CALL_IN_SCALE - (CALL_IN_SCALE - 1) * k * (2 - k),
    alpha: Math.max(0, Math.min(1, (CALL_TICKS - t) / CALL_OUT_TICKS)),
  };
}

/**
 * The entrance flash at age `t` (view ticks, 0..FLASH_TICKS) around a fighter `h` px tall: a white core flash in the first
 * ticks, a ring that grows from 0.5h to 1.3h (static at 1h with reduced motion) and fades, and the slide: speed lines that
 * close in from the team's side (`slide` px from the centre, 0 once arrived; none with reduced motion).
 */
export function flashPose(t: number, h: number, reduced: boolean): { readonly core: number; readonly ring: number; readonly alpha: number; readonly slide: number } {
  const p = Math.min(1, Math.max(0, t / FLASH_TICKS));
  const ease = 1 - (1 - p) * (1 - p);
  return {
    core: Math.max(0, 1 - t / 6) * 0.7,
    ring: reduced ? h : h * (0.5 + 0.8 * ease),
    alpha: 1 - p,
    slide: reduced ? 0 : h * 2 * (1 - Math.min(1, t / 10)),
  };
}
