import type { Aabb } from '../../math/aabb';
import { Cmd, type Command } from '../../sim/commands';
import type { ShotView } from '../agent';

/**
 * Tables and threat geometry of the Arcade AI layer (`ArcadeTactics`, FUN-DESIGN 2.11, WP-arcade-ai-personalities).
 * Deliberately not re-exported by the scripted-ai barrel, so the bundle inlines them and only tests import them by path.
 */

/** Difficulty levels: rows of ARCADE_AI_KNOBS. */
export const AI_EASY = 0;
export const AI_NORMAL = 1;
export const AI_HARD = 2;
export type ArcadeAiLevel = typeof AI_EASY | typeof AI_NORMAL | typeof AI_HARD;

/** Personalities (FUN-DESIGN 2.11 table; Tagger waits for WP-arcade-tag): rows of ARCADE_AI_STYLES. */
export const RUSHDOWN = 0;
export const ZONER = 1;
export const TURTLE = 2;
export type Style = typeof RUSHDOWN | typeof ZONER | typeof TURTLE;

/** Defence plans, in the order ARCADE_AI_STYLES gives their rates; NO_PLAN when the draw falls past all three. */
export const PARRY = 0;
export const DODGE = 1;
export const GUARD = 2;
export const NO_PLAN = 3;

type Knobs = readonly [number, number, number, number, number, number, number, number];

/**
 * Per level: [0] reaction min and [1] spread (`W.tick` ticks: min plus a draw below the spread, means 24, 14 and 8),
 * [2..4] the parry, dodge and guard scales (pm of the personality's rates; Easy never parries), [5] the parry timing
 * spread (the press comes 2 plus a draw below it game ticks before the hit; PARRY_TICKS is the window, so Normal whiffs
 * 2 in 9 and Hard never) and [6] the spacing dash rate (pm per tick). The combo cap is `1 + 2 * level` (1, 3, 5) and
 * Easy never supers; [7] is the guard-reflex rate (pm of threats; WP-arcade-ai-smarter). The scales above 1000 (Hard) leave a plan almost every threat (Normal acts on about 80%, Easy
 * on 30%).
 */
export const ARCADE_AI_KNOBS: readonly [Knobs, Knobs, Knobs] = [
  [20, 9, 0, 300, 300, 10, 10, 0],
  [10, 9, 800, 900, 900, 9, 25, 30],
  [4, 3, 1100, 1100, 1100, 6, 50, 900],
];

type Rates = readonly [parry: number, dodge: number, guard: number];

/** Per personality: parry, dodge and guard rates (pm) on a seen threat, before the level's scales. */
export const ARCADE_AI_STYLES: readonly [Rates, Rates, Rates] = [
  [300, 500, 100],
  [500, 300, 100],
  [400, 100, 400],
];

/** Normal's combo cap and confirm reaction (ARCADE_AI_KNOBS row 1). */
export const ARCADE_AI_COMBO_CAP = 3;
export const ARCADE_AI_REACTION_MIN = 10;
export const ARCADE_AI_REACTION_SPREAD = 9;
/**
 * Threat look-ahead, and how many game ticks before the hit a dodge dash and a guard start (the parry's press comes from
 * its draw): the shot then meets the dash's invulnerable ticks, and the guard holds before any parry window could open.
 */
export const ARCADE_AI_LOOKAHEAD = 40;
export const ARCADE_AI_DODGE_AT = 7;
export const ARCADE_AI_GUARD_AT = 20;
/**
 * Tag (FUN-DESIGN 2.6, WP-arcade-tag): free, with no threat and the tag ready, the AI tags its partner in when its own
 * HP is below ARCADE_AI_TAG_BELOW_PM per mille and the partner's is more than ARCADE_AI_TAG_MARGIN_PM above it.
 */
export const ARCADE_AI_TAG_BELOW_PM = 350;
export const ARCADE_AI_TAG_MARGIN_PM = 250;
/** Rushdown dashes in when the opponent is farther than this (top-left to top-left, |dx| + |dy|, px). */
export const ARCADE_AI_FAR_PX = 360;

/**
 * Game ticks until `p` (moving vx, vy per game tick) first overlaps `self`, when that is below `max`; `max` otherwise.
 * Folding over the shots with `max` = ARCADE_AI_LOOKAHEAD + 1 gives the soonest hit.
 */
export function impactIn(self: Aabb, p: ShotView, max: number): number {
  for (let t = 0; t < max; t++) {
    const x = p.x + p.vx * t;
    const y = p.y + p.vy * t;
    if (x < self.x + self.w && x + p.w > self.x && y < self.y + self.h && y + p.h > self.y) return t;
  }
  return max;
}

/** Movement bits from `self` towards `opp` on each axis where their centres are more than half its size apart. */
export function toward(self: Aabb, opp: Aabb): Command {
  const dx = opp.x + opp.w / 2 - (self.x + self.w / 2);
  const dy = opp.y + opp.h / 2 - (self.y + self.h / 2);
  return (dx > opp.w / 2 ? Cmd.right : dx < -opp.w / 2 ? Cmd.left : 0) |
    (dy > opp.h / 2 ? Cmd.down : dy < -opp.h / 2 ? Cmd.up : 0);
}

/**
 * Smarter play (FUN-DESIGN 2.21, WP-arcade-ai-smarter): small pure helpers that `ArcadeTactics` composes. Easy uses none.
 */

/** A hit this many game ticks away or fewer is met by a guard reflex (the press then lands inside the 8-tick parry window). */
export const ARCADE_AI_REFLEX_TICKS = 3;
/** Minimum `W.tick` ticks between two guard reflexes (a whiffed parry locks 20 game ticks; this keeps it from mashing). */
export const ARCADE_AI_REFLEX_GAP = 40;
/** Room (px) a sidestep dash needs on its side of the arena before it is taken. */
export const ARCADE_AI_SIDESTEP_ROOM = 140;
/** A ranged hero backs off when the opponent is closer than this (centre to centre, per axis max), a melee hero closes in beyond MELEE_PX. */
export const ARCADE_AI_RANGED_MIN_PX = 200;
export const ARCADE_AI_MELEE_PX = 320;
/** Hard tags out one notch earlier. */
export const ARCADE_AI_HARD_TAG_BELOW_PM = 450;

/** The first of `shots` that hits `self` within `within` game ticks, with the ticks until it does; undefined when none. */
export function soonestShot(self: Aabb, shots: readonly ShotView[], within: number): { readonly shot: ShotView; readonly t: number } | undefined {
  let best: { shot: ShotView; t: number } | undefined;
  let t = within + 1;
  for (const p of shots) {
    const n = impactIn(self, p, t);
    if (n < t) {
      t = n;
      best = { shot: p, t: n };
    }
  }
  return best;
}

/**
 * Guard reflex (1): press guard when a hit is at most ARCADE_AI_REFLEX_TICKS away, the guard is not in use lately
 * (`lastTick` is the `W.tick` of the last reflex, at least ARCADE_AI_REFLEX_GAP ago) and the drawn reflex is on.
 */
export function guardReflex(t: number, tick: number, lastTick: number, armed: boolean): boolean {
  return armed && t <= ARCADE_AI_REFLEX_TICKS && tick - lastTick >= ARCADE_AI_REFLEX_GAP;
}

/**
 * Sidestep (2): the movement bit of a dash that leaves the line of `shot` (a moving shot: sideways of its main axis, away
 * from its centre line, flipped when that side has under ARCADE_AI_SIDESTEP_ROOM px of the playfield `pf`); 0 for a shot
 * that does not move (melee) or when neither side has room.
 */
export function sidestepBit(self: Aabb, shot: ShotView, pf: Aabb): Command {
  if (shot.vx === 0 && shot.vy === 0) return 0;
  const horizontal = Math.abs(shot.vx) >= Math.abs(shot.vy);
  const c = horizontal ? self.y + self.h / 2 - (shot.y + shot.h / 2) : self.x + self.w / 2 - (shot.x + shot.w / 2);
  const lo = horizontal ? Cmd.up : Cmd.left;
  const hi = horizontal ? Cmd.down : Cmd.right;
  const roomLo = horizontal ? self.y - pf.y : self.x - pf.x;
  const roomHi = horizontal ? pf.y + pf.h - self.y - self.h : pf.x + pf.w - self.x - self.w;
  const [first, second, roomFirst, roomSecond] = c >= 0 ? [hi, lo, roomHi, roomLo] : [lo, hi, roomLo, roomHi];
  return roomFirst >= ARCADE_AI_SIDESTEP_ROOM ? first : roomSecond >= ARCADE_AI_SIDESTEP_ROOM ? second : 0;
}

/**
 * Spacing (3): the movement bit that keeps the hero's preferred range along the dominant axis; 0 when it is in range.
 * A ranged hero steps away from an opponent closer than ARCADE_AI_RANGED_MIN_PX (when `pf` leaves room behind it), a melee
 * hero steps in on one farther than ARCADE_AI_MELEE_PX.
 */
export function spacingBit(self: Aabb, opp: Aabb, ranged: boolean, pf: Aabb): Command {
  const dx = opp.x + opp.w / 2 - (self.x + self.w / 2);
  const dy = opp.y + opp.h / 2 - (self.y + self.h / 2);
  const horizontal = Math.abs(dx) >= Math.abs(dy);
  const d = horizontal ? dx : dy;
  const dist = Math.max(Math.abs(dx), Math.abs(dy));
  const towardBit = horizontal ? (d >= 0 ? Cmd.right : Cmd.left) : d >= 0 ? Cmd.down : Cmd.up;
  if (!ranged) return dist > ARCADE_AI_MELEE_PX ? towardBit : 0;
  if (dist >= ARCADE_AI_RANGED_MIN_PX) return 0;
  const awayBit = horizontal ? (d >= 0 ? Cmd.left : Cmd.right) : d >= 0 ? Cmd.up : Cmd.down;
  const room = horizontal
    ? (d >= 0 ? self.x - pf.x : pf.x + pf.w - self.x - self.w)
    : (d >= 0 ? self.y - pf.y : pf.y + pf.h - self.y - self.h);
  return room >= ARCADE_AI_SIDESTEP_ROOM / 2 ? awayBit : 0;
}

/**
 * Charge (4): a Rushdown melee hero charges from afar, never into a guard. (Charging in every style at Hard was tried:
 * Zoners and Turtles end the rush overlapped with the foe, where a melee box never hits, and Hard stalemates rose from 12 to 144 of 264.)
 */
export function chargeSensible(rushdown: boolean, oppGuarding: boolean): boolean {
  return rushdown && !oppGuarding;
}

/** Weather (4): an unfavourable element calls its weather; Hard also does when its own HP is under 500 pm. */
export function weatherSensible(level: ArcadeAiLevel, unfavourable: boolean, pm: number): boolean {
  return unfavourable || (level >= AI_HARD && pm < 500);
}

/**
 * Tag (4): 0 for no tag, 1 for `Cmd.swap1`, 2 for `Cmd.swap2`: the tag is ready, own HP (pm) is below the level's line
 * and the healthier bench hero (`bench1Pm`, `bench2Pm`; -1: none) is more than ARCADE_AI_TAG_MARGIN_PM above it.
 */
export function tagChoice(level: ArcadeAiLevel, tagIn: number, pm: number, bench1Pm: number, bench2Pm: number): 0 | 1 | 2 {
  const two = bench2Pm > bench1Pm;
  const bench = two ? bench2Pm : bench1Pm;
  const below = level >= AI_HARD ? ARCADE_AI_HARD_TAG_BELOW_PM : ARCADE_AI_TAG_BELOW_PM;
  return tagIn === 0 && pm < below && bench - pm > ARCADE_AI_TAG_MARGIN_PM ? (two ? 2 : 1) : 0;
}
