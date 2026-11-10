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

type Knobs = readonly [number, number, number, number, number, number, number, number, number];

/**
 * Per level: [0] reaction min and [1] spread (`W.tick` ticks: min plus a draw below the spread, means 24, 14 and 8),
 * [2..4] the parry, dodge and guard scales (pm of the personality's rates; Easy never parries), [5] the parry timing
 * spread (the press comes 2 plus a draw below it game ticks before the hit; PARRY_TICKS is the window, so Normal whiffs
 * 2 in 9 and Hard never) and [6] the spacing dash rate (pm per tick). The combo cap is `1 + 2 * level` (1, 3, 5) and
 * Easy never supers. The scales above 1000 (Hard) leave a plan almost every threat (Normal acts on about 80%, Easy
 * on 30%). [7] the rate (pm per
 * tick, doubled below ARCADE_AI_DESPERATE_PM of its HP) at which it spends a full bar on a super that reaches the
 * opponent even without a confirm, and [8] the rate at which a Zoner or Turtle melee hero also charges from afar (all pm per tick; Easy: none).
 */
export const ARCADE_AI_KNOBS: readonly [Knobs, Knobs, Knobs] = [
  [20, 9, 0, 300, 300, 10, 10, 0, 0],
  [10, 9, 800, 900, 900, 9, 25, 12, 0],
  [6, 5, 1100, 1100, 1100, 6, 50, 90, 25],
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
/** Below this HP per mille the free-super rate doubles. */
export const ARCADE_AI_DESPERATE_PM = 400;

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
