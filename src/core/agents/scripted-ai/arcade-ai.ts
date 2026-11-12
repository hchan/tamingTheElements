import { TRAP_BOX_PX, TRAP_MIN_GAP_PX, TRAP_PLACE_PX, TRAP_TRIGGER_PX, TrapKind } from '../../data/arcade';
import type { Aabb } from '../../math/aabb';
import { Cmd, type Command } from '../../sim/commands';
import type { ArcadeView, ShotView, TrapView } from '../agent';

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

/** Elemental ability (FUN-DESIGN 2.24): a fire hero's Ember once the foe is this close (centre to centre, the larger axis offset). */
export const ARCADE_AI_EMBER_PX = 240;

/**
 * Elemental ability (FUN-DESIGN 2.24), Normal and Hard (Easy never): with the ability ready, Ember (fire) on a stunned
 * foe or one within ARCADE_AI_EMBER_PX, Cleanse (water) when rooted or slowed, Stoneskin (earth) while the foe's super
 * runs or under 500 pm of HP, Gale (air) when the foe is farther than ARCADE_AI_FAR_PX. No draw. `pm` is own HP per
 * mille, `dist` the `centreDist` to the foe.
 */
export function elementalSensible(level: ArcadeAiLevel, a: ArcadeView, pm: number, dist: number): boolean {
  if (level === AI_EASY || a.elemIn !== 0) return false;
  switch (a.elemKind) {
    case 1: return a.oppStun > 0 || dist <= ARCADE_AI_EMBER_PX;
    case 2: return a.selfRooted > 0 || a.selfSlowed;
    case 3: return a.oppSuperActive || pm < 500;
    case 4: return dist > ARCADE_AI_FAR_PX;
    default: return false;
  }
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

/**
 * Traps (WP 39c, FUN-DESIGN 2.23): pure helpers `ArcadeTactics` composes. Distances are centre to centre, the larger axis
 * offset (as `spacingBit`). Never plant closer than ARCADE_AI_TRAP_MIN_PX (the foe would only cross it while it arms).
 */
export const ARCADE_AI_TRAP_MIN_PX = 96;
/** Per personality, the band (px) in which an approaching foe draws a plant: Rushdown late, Zoner early, Turtle in between. */
export const ARCADE_AI_TRAP_BAND: readonly (readonly [number, number])[] = [[160, 220], [240, 360], [160, 300]];
/** Cornered: own back within this many px of a side wall, the foe on the open side and at most the Zoner band's far edge away. */
export const ARCADE_AI_TRAP_CORNER_PX = 120;
/** Hard plants on a foe its own Snag roots within this distance (the trap lands TRAP_PLACE_PX ahead, the foe inside its trigger). */
export const ARCADE_AI_TRAP_ROOT_PX = 200;
/** Per level, the plant rate (pm per tick) while a zoning or corner reason holds. */
export const ARCADE_AI_TRAP_RATE: readonly [number, number, number] = [20, 240, 300];
/**
 * Follow-up (WP 39f): sim ticks (`view.tick`, which counts through hit-stop) a Normal or Hard AI keeps pressing a foe in its own
 * Puddle. Re-armed every tick the foe is in it, so the press lasts this long after the foe leaves (the Puddle's linger).
 */
export const ARCADE_AI_PRESS_PUDDLE_TICKS = 60;
/** Follow-up (WP 39f): sim ticks (through hit-stop) of pressing after one of its Gusts fires (and shoves the foe). */
export const ARCADE_AI_PRESS_GUST_TICKS = 45;
/** A ranged hero presses a slowed or shoved foe until it is this near (px, `far`); a melee hero until SNAG_CLOSE_PX. */
export const ARCADE_AI_PRESS_RANGED_PX = 200;
/** Look-ahead (px) of the avoid rule: a step this long that newly enters a foe trap's trigger square is on the path. */
export const ARCADE_AI_TRAP_LOOK_PX = 12;
/** A foe Fire Bomb or Spike arming in more game ticks than this is dashed across (DASH_TICKS: the dash is over first). */
export const ARCADE_AI_TRAP_DASH_TICKS = 12;
/** Easy ignores foe traps in the second half of every 256 `W.tick` ticks ("walks into traps now and then"; no draw). */
export const ARCADE_AI_EASY_TRAP_BLIND = 128;

/** Why to plant now: 0 none, 1 an approaching foe in the style's band, 2 cornered, 3 a foe rooted by own Snag (Hard). */
export const TRAP_NONE = 0;
export const TRAP_ZONE = 1;
export const TRAP_CORNER = 2;
export const TRAP_ROOT = 3;

/** The larger axis offset between the two centres (px). */
export function centreDist(self: Aabb, opp: Aabb): number {
  return Math.max(Math.abs(opp.x + opp.w / 2 - self.x - self.w / 2), Math.abs(opp.y + opp.h / 2 - self.y - self.h / 2));
}

/**
 * The plant reason (TRAP_NONE when there is none) for `self` facing `opp` at `dist` (`centreDist`) that was `prevDist`
 * a tick earlier (-1: unknown), in playfield `pf`, with `rooted` the foe's root by this side's own Snag (ticks left; 0 none).
 */
export function trapReason(level: ArcadeAiLevel, style: Style, self: Aabb, opp: Aabb, dist: number, prevDist: number, rooted: number, pf: Aabb): number {
  if (dist < ARCADE_AI_TRAP_MIN_PX) return TRAP_NONE;
  if (level >= AI_HARD && rooted > 0 && dist <= ARCADE_AI_TRAP_ROOT_PX) return TRAP_ROOT;
  const band = ARCADE_AI_TRAP_BAND[style] ?? [0, 0];
  if (dist >= band[0] && dist <= band[1] && prevDist > dist) return TRAP_ZONE;
  const oppRight = opp.x + opp.w / 2 >= self.x + self.w / 2;
  const back = oppRight ? self.x - pf.x : pf.x + pf.w - self.x - self.w;
  return back <= ARCADE_AI_TRAP_CORNER_PX && dist <= (ARCADE_AI_TRAP_BAND[ZONER]?.[1] ?? 0) ? TRAP_CORNER : TRAP_NONE;
}

/** True when `self` moved by (`dx`, `dy`) overlaps trap `t`'s trigger square (TRAP_BOX_PX inflated by TRAP_TRIGGER_PX). */
function inTrigger(self: Aabb, t: TrapView, dx: number, dy: number): boolean {
  const x = self.x + dx;
  const y = self.y + dy;
  return x < t.x + TRAP_BOX_PX + TRAP_TRIGGER_PX && t.x - TRAP_TRIGGER_PX < x + self.w &&
    y < t.y + TRAP_BOX_PX + TRAP_TRIGGER_PX && t.y - TRAP_TRIGGER_PX < y + self.h;
}

/** True when `foe` stands in the trigger square of one of its own armed Puddles (the sim slows it there, 60 ticks past). */
export function foeInOwnPuddle(foe: Aabb, traps: readonly TrapView[]): boolean {
  for (const t of traps) if (t.own && t.kind === TrapKind.puddle && t.armIn === 0 && inTrigger(foe, t, 0, 0)) return true;
  return false;
}

/** The x and y of the movement bits of `cmd` as a ARCADE_AI_TRAP_LOOK_PX step (no tuple: this runs every tick). */
function stepX(cmd: Command): number {
  return ((cmd & Cmd.right) !== 0 ? ARCADE_AI_TRAP_LOOK_PX : 0) - ((cmd & Cmd.left) !== 0 ? ARCADE_AI_TRAP_LOOK_PX : 0);
}
function stepY(cmd: Command): number {
  return ((cmd & Cmd.down) !== 0 ? ARCADE_AI_TRAP_LOOK_PX : 0) - ((cmd & Cmd.up) !== 0 ? ARCADE_AI_TRAP_LOOK_PX : 0);
}

/** The first foe trap that the movement of `cmd` steps into (from outside its trigger square), or undefined. */
export function trapOnStep(self: Aabb, traps: readonly TrapView[], cmd: Command): TrapView | undefined {
  const dx = stepX(cmd);
  const dy = stepY(cmd);
  if (dx === 0 && dy === 0) return undefined;
  for (const t of traps) if (!t.own && !inTrigger(self, t, 0, 0) && inTrigger(self, t, dx, dy)) return t;
  return undefined;
}

/**
 * Avoid (WP 39c): the movement bits that step around foe trap `t` met by `cmd` (a lateral nudge: the other axis towards
 * the nearer side of its trigger square, with or without the blocked move, first one that stays in `pf` and off every
 * foe trap), or 0 to stand still when none does.
 */
export function trapNudge(self: Aabb, traps: readonly TrapView[], t: TrapView, cmd: Command, pf: Aabb): Command {
  const horizontal = stepX(cmd) !== 0;
  const keep = cmd & (horizontal ? Cmd.left | Cmd.right : Cmd.up | Cmd.down);
  const c = horizontal ? self.y + self.h / 2 - t.y - TRAP_BOX_PX / 2 : self.x + self.w / 2 - t.x - TRAP_BOX_PX / 2;
  const lo = horizontal ? Cmd.up : Cmd.left;
  const hi = horizontal ? Cmd.down : Cmd.right;
  const first = c < 0 ? lo : hi;
  const second = c < 0 ? hi : lo;
  for (let k = 0; k < 4; k++) {
    const bits = (k & 1 ? 0 : keep) | (k < 2 ? first : second);
    const x = self.x + stepX(bits);
    const y = self.y + stepY(bits);
    const inside = x >= pf.x && y >= pf.y && x + self.w <= pf.x + pf.w && y + self.h <= pf.y + pf.h;
    if (inside && trapOnStep(self, traps, bits) === undefined) return bits;
  }
  return 0;
}

/** Normal and Hard dash across a foe Fire Bomb or Spike that arms after the dash is over (walking across takes longer). */
export function trapDashable(level: ArcadeAiLevel, t: TrapView): boolean {
  return level > AI_EASY && (t.kind === TrapKind.fireBomb || t.kind === TrapKind.spike) && t.armIn > ARCADE_AI_TRAP_DASH_TICKS;
}

/** The sign of offset `d` in an 8-way direction (the auto-face aim, `dirToward`): 0 when the `other` axis is at least twice it. */
function aimSign(d: number, other: number): number {
  return Math.abs(d) * 2 <= Math.abs(other) ? 0 : Math.sign(d);
}

/** An 8-way direction code of (dx, dy) as `aimSign` picks it. */
function dir8(dx: number, dy: number): number {
  return aimSign(dx, dy) * 3 + aimSign(dy, dx);
}

/**
 * True when a trap planted now (auto-faced at `opp`: TRAP_PLACE_PX ahead of the centre, clamped to `pf`) would not be
 * refused for lying within TRAP_MIN_GAP_PX of another trap on both axes (a refused press would hold the AI still).
 */
export function trapSpotFree(self: Aabb, opp: Aabb, traps: readonly TrapView[], pf: Aabb): boolean {
  const cx = self.x + self.w / 2;
  const cy = self.y + self.h / 2;
  const dx = opp.x + opp.w / 2 - cx;
  const dy = opp.y + opp.h / 2 - cy;
  const x = Math.trunc(Math.min(Math.max(cx + aimSign(dx, dy) * TRAP_PLACE_PX - TRAP_BOX_PX / 2, pf.x), pf.x + pf.w - TRAP_BOX_PX));
  const y = Math.trunc(Math.min(Math.max(cy + aimSign(dy, dx) * TRAP_PLACE_PX - TRAP_BOX_PX / 2, pf.y), pf.y + pf.h - TRAP_BOX_PX));
  for (const t of traps) if (Math.abs(t.x - x) < TRAP_MIN_GAP_PX && Math.abs(t.y - y) < TRAP_MIN_GAP_PX) return false;
  return true;
}

/**
 * Counter (Hard, a fire shot): a foe Puddle or Gust nearer than the foe in the same 8-way direction (as the auto-face
 * aim picks it: a diagonal unless one offset is twice the other) is on the shot's way, so a shot douses it.
 */
export function trapToDouse(self: Aabb, opp: Aabb, traps: readonly TrapView[]): boolean {
  const cx = self.x + self.w / 2;
  const cy = self.y + self.h / 2;
  const fx = opp.x + opp.w / 2 - cx;
  const fy = opp.y + opp.h / 2 - cy;
  for (const t of traps) {
    if (t.own || (t.kind !== TrapKind.puddle && t.kind !== TrapKind.gust)) continue;
    const tx = t.x + TRAP_BOX_PX / 2 - cx;
    const ty = t.y + TRAP_BOX_PX / 2 - cy;
    if (dir8(tx, ty) === dir8(fx, fy) && Math.max(Math.abs(tx), Math.abs(ty)) < Math.max(Math.abs(fx), Math.abs(fy))) return true;
  }
  return false;
}

/**
 * Step-apart for a stale fight whose two boxes overlap (a melee box starts at the edge, so overlapped fighters never hit;
 * both end up stuck in a wall corner). The movement bit away from `opp` on the axis with the most room to the wall, or
 * the other axis when that one is walled; 0 when the boxes are not overlapped. Ties (equal centres) go right/down.
 */
export function stepApart(self: Aabb, opp: Aabb, pf: Aabb): Command {
  const dx = self.x + self.w / 2 - (opp.x + opp.w / 2);
  const dy = self.y + self.h / 2 - (opp.y + opp.h / 2);
  if (Math.abs(dx) * 2 >= self.w + opp.w || Math.abs(dy) * 2 >= self.h + opp.h) return 0;
  const room = (bit: Command): number =>
    bit === Cmd.right ? pf.x + pf.w - (self.x + self.w) : bit === Cmd.left ? self.x - pf.x : bit === Cmd.down ? pf.y + pf.h - (self.y + self.h) : self.y - pf.y;
  const bx = dx >= 0 ? Cmd.right : Cmd.left;
  const by = dy >= 0 ? Cmd.down : Cmd.up;
  // The axis along which the foe is further off (so the gap opens fastest), unless that way is walled.
  const [first, second] = Math.abs(dx) / (self.w + opp.w) >= Math.abs(dy) / (self.h + opp.h) ? [bx, by] : [by, bx];
  return room(first) > 0 ? first : room(second) > 0 ? second : first === bx ? (dx >= 0 ? Cmd.left : Cmd.right) : dy >= 0 ? Cmd.up : Cmd.down;
}
