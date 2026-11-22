import {
  arcadePlayfield, CHARGE_AI_MIN_DIST, hazardWarnTicks, SNAG_RANGE_PX, SNAG_WIDTH_PX, SUPER_CHORD_TICKS, SUPER_COST, TRAP_TEAM_MAX,
  RoundPhase, TrapKind, WEATHER_CHARGE_FULL,
} from '../../data/arcade';
import { SUPER_BURST, SUPER_QUAKE_RING_PX, SUPER_SPECS, SuperShape, quakeRingSide } from '../../data/arcade-supers';
import { ARCADE_AI_STREAM_NAMES } from '../../rng/streams';
import { Cmd, type Command } from '../../sim/commands';
import { EntityFlag } from '../../sim/state';
import {
  stateRecord, type AgentState, type ArcadeView, type FighterView, type ObservationView, type RockView,
} from '../agent';
import { AgentRng } from '../agent-rng';
import {
  AI_EASY, AI_NORMAL, ARCADE_AI_DODGE_AT, ARCADE_AI_EASY_TRAP_BLIND, ARCADE_AI_FAR_PX, ARCADE_AI_FATIGUE_REFLEX_MAX, ARCADE_AI_FATIGUE_RESET_TICKS, ARCADE_AI_FATIGUE_WINDOW, ARCADE_AI_GUARD_AT, ARCADE_AI_KIT_CORNER_FOE_PX, ARCADE_AI_KIT_CORNER_PX, ARCADE_AI_KIT_HEAL_BELOW_PM, ARCADE_AI_KIT_HIDE_PX, ARCADE_AI_KIT_HOP_PX, ARCADE_AI_KIT_OMNI_PX, ARCADE_AI_KNOBS,
  ARCADE_AI_LOOKAHEAD, ARCADE_AI_PRESS_GUST_TICKS, ARCADE_AI_PRESS_PUDDLE_TICKS, ARCADE_AI_PRESS_RANGED_PX,
  ARCADE_AI_STYLES, ARCADE_AI_TRAP_RATE, DODGE, AI_HARD, NO_PLAN, PARRY, RUSHDOWN, TRAP_NONE, TRAP_ROOT, TURTLE,
  centreDist, ARCADE_AI_EASY_OPENING_MASK, easyOpening, ccAvoidImmune, fatigueScale, ccEscape, chargeSensible, cleanseSensible, elementalSensible, foeInOwnPuddle, guardReflex, hazardExit, hazardKeepOut, sidestepBit, soonestShot, spacingBit, stepApart, tagChoice, toward, trapDashable, trapNudge,
  trapOnStep, trapReason, trapSpotFree, trapToDouse, wallHold, weatherSensible, zoneStep, type ArcadeAiLevel, type KitKind, type Style,
} from './arcade-ai';

/**
 * Arcade layer of the scripted AI (FUN-DESIGN 2.11, WP-arcade-ai-basic and WP-arcade-ai-personalities). It only edits
 * the command the Classic AI chose, and only when the view carries `arcade`, so Classic decisions are untouched; its
 * randomness is its own `AgentRng` stream (ARCADE_AI_STREAM_NAMES), drawn only in Arcade.
 *
 * - Combo: the base AI already fires whenever a ready shot lines up, which keeps hitting a stunned (still) opponent; Normal and Hard also line up (alignStep), close in or Charge when a slot is ready.
 *   While the opponent is stunned the layer steps in along the line it shares with it (`pressStep`), so the next shot
 *   flies a shorter way and can land inside the stun; it holds the attack buttons once its own combo reaches the
 *   level's combo cap.
 * - Super: on a confirm (the opponent is stunned) with a full bar (SUPER_COST), after a reaction delay counted from the
 *   first tick it saw that stun, it faces the opponent and presses `Cmd.super`, if its race's super (band, box,
 *   rings or wall) would reach the opponent (never on Easy).
 * - 8-way aim (WP-arcade-8way-aim): a shot the base AI chose keeps its 4-way facing (a second movement axis is dropped,
 *   as Classic's x-wins facing would), and when no shot lines up on an axis but the opponent sits on a diagonal
 *   (`diagonalLine`), a ready projectile slot fires along that diagonal.
 * - Chords (WP-arcade-buffer): primary and secondary pressed within SUPER_CHORD_TICKS start a super, so the layer drops a
 *   press that would complete one by accident (`avoidChord`); its own super is always `Cmd.super`.
 * - Defence: the soonest hit among `ArcadeView.shots` (`impactIn`, the projectiles a player sees) is a threat. Once per
 *   threat it draws a reaction delay and a plan from its personality's rates scaled by the level (`arcade-ai.ts`):
 *   parry (press guard when the hit is 2 plus a drawn spread game ticks away; past PARRY_TICKS the press whiffs and the
 *   held guard blocks), dodge (a dash towards the opponent 7 ticks before the hit, through the shot on its invulnerable
 *   ticks; a guard press instead while the dash is not ready), guard (hold from 20 ticks away) or nothing.
 * - Spacing: Rushdown dashes in when the opponent is farther than ARCADE_AI_FAR_PX, at the level's rate per tick; Zoner and
 *   Turtle leave spacing to the base AI's kiting, and play Rushdown after ARCADE_AI_STALE_TICKS without an HP change.
 * - Tag (WP-arcade-tag): free, with no threat and the tag ready, it tags (`Cmd.swap1`) when its HP is below
 *   ARCADE_AI_TAG_BELOW_PM and its partner's is more than ARCADE_AI_TAG_MARGIN_PM above; no draw, no memory. 3v3
 *   (WP-arcade-3v3): the healthier of the two bench heroes, `Cmd.swap2` when it is the second one.
 * - Smarter play (WP-arcade-ai-smarter, FUN-DESIGN 2.21; helpers in arcade-ai.ts): a guard reflex when a hit is 3 ticks away
 *   (a drawn share of threats by level, never twice within 40 ticks), a dodge that dashes sideways out of a moving shot's line,
 *   spacing (ranged heroes back off inside 200 px at Hard, melee heroes close in beyond 320 px), Rushdown never charges into a guard, Hard supers on a rooted foe, calls weather and tags out earlier. Easy uses none of it.
 * - Weather: free, with its weather charged and ready and no threat, it calls its weather when its element is at a disadvantage.
 * - Elemental ability (FUN-DESIGN 2.24, Normal and Hard; `elementalSensible`): free, with the ability ready, it adds the
 *   press to whatever it does: Ember close in or on a stunned foe, Cleanse when rooted or slowed, Stoneskin against a super
 *   or at low HP, Gale from afar.
 * - Traps (WP 39c, FUN-DESIGN 2.23; helpers in arcade-ai.ts): free, with no threat, the trap ready and its team under
 *   TRAP_TEAM_MAX, it plants (auto-faced at the foe, never under 96 px from it, never on a spot another trap blocks) when
 *   the foe closes in through its personality's band (Rushdown late, Zoner early), when its back is to a side wall, at
 *   the level's rate per tick (not in a stale fight), and at Hard at once on a foe its Snag roots. It steps round a foe trap its next step would
 *   enter (a lateral nudge); Normal and Hard dash across a foe Fire Bomb or Spike that arms after the dash; Easy ignores
 *   foe traps half the time. Hard with a fire shot shoots a foe Puddle or Gust that lies between it and the foe.
 * - Hazards (stage hazards, `hazard`; helpers in arcade-ai.ts): during a hazard's warning, once the level's reaction
 *   (ARCADE_AI_KNOBS[0] game ticks into it) has passed, a free fighter in the warned box walks out the shortest way that
 *   stays in the playfield, and one outside does not step in; guard, dash, super, charge and trap commands go first.
 *   Easy reads it half the time (as foe traps). No draw and no memory.
 */

const MOVE = Cmd.up | Cmd.down | Cmd.left | Cmd.right;
const ATTACK = Cmd.primary | Cmd.secondary;
/** A plant: no movement (the aim auto-faces the foe; a held diagonal would turn it) and no attack press this tick. */
const plant = (cmd: Command): Command => (cmd & ~(MOVE | ATTACK)) | Cmd.trap;

/**
 * The movement bit that faces `self` towards `opp` so its super (`superId`, `SuperSpec`) reaches `opp`; 0 when no 4-way
 * facing would. A beam is a band (`size` across, from the caster's centre to the wall on its facing side); a vortex and
 * a quake are squares centred on the caster (the quake's reach is its last ring), so the facing only picks the nearer
 * axis; a tidal wall spans the whole arena across its path, so any opponent on the facing side is hit.
 */
export function superFacing(self: FighterView, opp: FighterView, superId = 0): Command {
  const spec = SUPER_SPECS[superId] ?? SUPER_BURST;
  const cx = self.x + self.w / 2;
  const cy = self.y + self.h / 2;
  const dx = opp.x + opp.w / 2 - cx;
  const dy = opp.y + opp.h / 2 - cy;
  const horizontal = dx >= 0 ? Cmd.right : Cmd.left;
  const vertical = dy >= 0 ? Cmd.down : Cmd.up;
  if (spec.shape === SuperShape.tide) return Math.abs(dx) >= Math.abs(dy) ? horizontal : vertical;
  if (spec.shape !== SuperShape.beam) {
    const reach = spec.shape === SuperShape.quake
      ? quakeRingSide(SUPER_QUAKE_RING_PX.length - 1, spec.scalePm, self.w)
      : spec.size;
    const half = reach / 2;
    if (opp.x >= cx + half || opp.x + opp.w <= cx - half || opp.y >= cy + half || opp.y + opp.h <= cy - half) return 0;
    return Math.abs(dx) >= Math.abs(dy) ? horizontal : vertical;
  }
  const half = spec.size / 2;
  if (opp.y < cy + half && opp.y + opp.h > cy - half) return horizontal;
  if (opp.x < cx + half && opp.x + opp.w > cx - half) return vertical;
  return 0;
}

/**
 * The two movement bits of the diagonal from `self` to `opp` when a diagonal shot from `self`'s centre would meet `opp`
 * (centres off both axes by more than half the opponent's size, and the two offsets within half its height of each
 * other); 0 otherwise. A diagonal shot moves +-speed on both axes, so it stays on that line.
 */
export function diagonalLine(self: FighterView, opp: FighterView): Command {
  const dx = opp.x + opp.w / 2 - (self.x + self.w / 2);
  const dy = opp.y + opp.h / 2 - (self.y + self.h / 2);
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ax <= opp.w / 2 || ay <= opp.h / 2 || Math.abs(ax - ay) > opp.h / 2) return 0;
  return (dx > 0 ? Cmd.right : Cmd.left) | (dy > 0 ? Cmd.down : Cmd.up);
}

/** `pressStep` stops closing in this many px (centre to centre) from the opponent. */
export const ARCADE_AI_PRESS_MIN_PX = 120;

/**
 * `cmd` with its movement replaced by one step towards `opp` along the axis they share (centres within half the
 * opponent's height or width), unless they are already within ARCADE_AI_PRESS_MIN_PX on it, share no axis, or `cmd`
 * fires along another direction (the step would turn the shot).
 */
export function pressStep(self: FighterView, opp: FighterView, cmd: Command): Command {
  const dx = opp.x + opp.w / 2 - (self.x + self.w / 2);
  const dy = opp.y + opp.h / 2 - (self.y + self.h / 2);
  let bit = 0;
  if (Math.abs(dy) <= opp.h / 2 && Math.abs(dx) > ARCADE_AI_PRESS_MIN_PX) bit = dx > 0 ? Cmd.right : Cmd.left;
  else if (Math.abs(dx) <= opp.w / 2 && Math.abs(dy) > ARCADE_AI_PRESS_MIN_PX) bit = dy > 0 ? Cmd.down : Cmd.up;
  if (bit === 0) return cmd;
  if ((cmd & ATTACK) !== 0 && (cmd & MOVE) !== 0 && (cmd & MOVE) !== bit) return cmd;
  return (cmd & ~MOVE) | bit;
}

/** True when ability slot `slot` is off cooldown and is not the Snag slot (`snagSlot`; Snag never chains). */
export function slotReady(view: ObservationView, slot: number, snagSlot: number): boolean {
  return slot !== snagSlot && (view.cooldowns[slot] ?? 1) === 0;
}

/**
 * Follow-up (combo chaining): `cmd` with its movement replaced by one step that brings `self` onto a line it shares with
 * the (stunned, so still) opponent: along the axis with the smaller offset, towards it, when that offset is more than
 * half the opponent's size; `cmd` when a line is already shared. Once the lines match, the base AI's own shot fires.
 */
export function alignStep(self: FighterView, opp: FighterView, cmd: Command): Command {
  const dx = opp.x + opp.w / 2 - (self.x + self.w / 2);
  const dy = opp.y + opp.h / 2 - (self.y + self.h / 2);
  const offX = Math.abs(dx) > opp.w / 2;
  const offY = Math.abs(dy) > opp.h / 2;
  if (!offX || !offY) return cmd;
  const bit = Math.abs(dy) <= Math.abs(dx) ? (dy > 0 ? Cmd.down : Cmd.up) : dx > 0 ? Cmd.right : Cmd.left;
  return (cmd & ~MOVE) | bit;
}

/**
 * `cmd` without the attack press that would complete a primary and secondary super chord (FUN-DESIGN 2.12), when a
 * chord would start a super (a bar of meter, no super running): a new secondary press goes when primary is new too or
 * was pressed SUPER_CHORD_TICKS or fewer game ticks ago, then a new primary press goes on the same test against
 * secondary.
 */
export function avoidChord(a: ArcadeView, cmd: Command): Command {
  if (a.meter < SUPER_COST || a.superActive) return cmd;
  const rise = cmd & ~a.prevCmd;
  const recent = (age: number): boolean => age >= 0 && age <= SUPER_CHORD_TICKS;
  if ((rise & Cmd.secondary) !== 0 && ((rise & Cmd.primary) !== 0 || recent(a.primaryAge))) return cmd & ~Cmd.secondary;
  if ((rise & Cmd.primary) !== 0 && recent(a.secondaryAge)) return cmd & ~Cmd.primary;
  return cmd;
}

/** Rock avoidance (FUN-DESIGN 2.15): the look-ahead step in px, how many `W.tick` ticks a chosen slide is held, and the line samples. */
export const ARCADE_AI_ROCK_STEP = 8;
export const ARCADE_AI_SLIDE_TICKS = 30;
/** SIM_VERSION 83: the wall look-ahead, px. A wall only reverts the out-of-arena axis (walls slide), so it needs to cover just the smallest real step. */
export const ARCADE_AI_WALL_PROBE = 3;
const LINE_SAMPLES = 16;

const hitsRock = (r: RockView, x: number, y: number, w: number, h: number): boolean =>
  x < r.x + r.w && r.x < x + w && y < r.y + r.h && r.y < y + h;

/** Does the box swept from (x, y) by (dx, dy) touch the rock? Exact for every per-axis step up to (dx, dy), where a rock stops the whole step. */
const sweptHits = (r: RockView, x: number, y: number, w: number, h: number, dx: number, dy: number): boolean =>
  hitsRock(r, dx < 0 ? x + dx : x, dy < 0 ? y + dy : y, w + Math.abs(dx), h + Math.abs(dy));

/** The movement bits `cmd` holds, as a step (left/right and up/down cancel). */
const stepOf = (cmd: Command): readonly [number, number] => [
  ((cmd & Cmd.right) !== 0 ? ARCADE_AI_ROCK_STEP : 0) - ((cmd & Cmd.left) !== 0 ? ARCADE_AI_ROCK_STEP : 0),
  ((cmd & Cmd.down) !== 0 ? ARCADE_AI_ROCK_STEP : 0) - ((cmd & Cmd.up) !== 0 ? ARCADE_AI_ROCK_STEP : 0),
];

/** The first rock on the straight line between the two centres (sampled at LINE_SAMPLES + 1 points), or undefined. */
export function rockOnLine(self: FighterView, opp: FighterView, rocks: readonly RockView[]): RockView | undefined {
  const cx = self.x + self.w / 2;
  const cy = self.y + self.h / 2;
  const dx = opp.x + opp.w / 2 - cx;
  const dy = opp.y + opp.h / 2 - cy;
  for (let i = 1; i < LINE_SAMPLES; i++) {
    const px = cx + (dx * i) / LINE_SAMPLES;
    const py = cy + (dy * i) / LINE_SAMPLES;
    const r = rocks.find((k) => hitsRock(k, px, py, 0, 0));
    if (r !== undefined) return r;
  }
  return undefined;
}

/** Slot names of the ArcadeTactics memory tuple; the order is the saved format (FRESH, save/load), never reorder. */
const enum Mem {
  superSince,
  superReact,
  threatSince,
  threatReact,
  plan,
  guardAt,
  style,
  slideBits,
  slideUntil,
  hpChangeAt,
  hpSum,
  reflexAt,
  reflexOk,
  lastDist,
  pressUntil,
  gusts,
  fatigue,
  fatigueAt,
  fatigueWindowAt,
  lastHp,
  runX,
  runY,
  runStill,
  openAt,
}

type Memory = [
  number, number, number, number, number, number, number, number, number, number,
  number, number, number, number, number, number, number, number, number, number,
  number, number, number, number,
];
const FRESH: Readonly<Memory> = [-1, 0, -1, 0, NO_PLAN, 0, -1, 0, 0, 0, 0, -1000, 0, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1000];

/**
 * Run Away / Run Towards (SIM_VERSION 89, Normal and Hard; FUN-DESIGN 2.29). A ranged hero runs away once the foe is within
 * ARCADE_AI_RUN_NEAR_PX (centre Chebyshev distance) and breaks the run past ARCADE_AI_RUN_FAR_PX, when cornered, or after
 * ARCADE_AI_RUN_STILL_TICKS free ticks without moving; a melee hero runs in from CHARGE_AI_MIN_DIST while its Charge is on cooldown.
 */
export const ARCADE_AI_RUN_NEAR_PX = 260;
export const ARCADE_AI_RUN_FAR_PX = 520;
export const ARCADE_AI_RUN_STILL_TICKS = 10;

/** The 8 px of room a Run Away needs (RUN_EDGE_PX) to keep a component. */
const RUN_ROOM_PX = 8;

/** True when a Run Away from `opp` has nowhere to go: both components of the away step are blocked by the playfield edge (the sim's `runDirection` rule, without the perpendicular escape). */
export function runCornered(self: FighterView, opp: FighterView, pf: { x: number; y: number; w: number; h: number }): boolean {
  const dx = opp.x + opp.w / 2 - (self.x + self.w / 2);
  const dy = opp.y + opp.h / 2 - (self.y + self.h / 2);
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  const sx = ax * 2 <= ay ? 0 : dx > 0 ? -1 : dx < 0 ? 1 : 0;
  const sy = ay * 2 <= ax ? 0 : dy > 0 ? -1 : dy < 0 ? 1 : 0;
  const roomX = sx < 0 ? self.x - pf.x : pf.x + pf.w - self.x - self.w;
  const roomY = sy < 0 ? self.y - pf.y : pf.y + pf.h - self.y - self.h;
  return (sx === 0 || roomX < RUN_ROOM_PX) && (sy === 0 || roomY < RUN_ROOM_PX);
}

/** Game ticks without any HP change on the field after which the AI stops retreating and presses (no stalemates). */
export const ARCADE_AI_STALE_TICKS = 400;
/** Stage 2 (800 quiet ticks): half the defensive plans, no guard reflex, walk in even under threat, break 1v1 shot clashes. */
export const ARCADE_AI_STALE2_TICKS = 800;
/** Stage 3 (1100 quiet ticks, below the 1500-tick stalemate end): no defence, press every ready move. */
export const ARCADE_AI_STALE3_TICKS = 1100;

/** Within every 256 ticks, the tick from which a tag team's AI fires along a rock-cut line (WP-arcade-2v2-tune). */
const SHOOT_FROM = 64;

/**
 * Snag (FUN-DESIGN 2.20): the movement bit that faces `opp` along an axis where the SNAG_RANGE_PX x SNAG_WIDTH_PX throw
 * reaches it (its box overlaps the band along the axis, within range of `self`'s edge), else 0.
 */
export function snagLane(self: FighterView, opp: FighterView): Command {
  const dx = opp.x + opp.w / 2 - (self.x + self.w / 2);
  const dy = opp.y + opp.h / 2 - (self.y + self.h / 2);
  const gapX = Math.abs(dx) - (self.w + opp.w) / 2;
  const gapY = Math.abs(dy) - (self.h + opp.h) / 2;
  // Overlapped boxes: the rope starts at the thrower's edge, behind the foe, and misses (a wasted cooldown; WP-snag-tune).
  if (gapX < 0 && gapY < 0) return 0;
  if (Math.abs(dy) * 2 < SNAG_WIDTH_PX + opp.h && gapX < SNAG_RANGE_PX) return dx >= 0 ? Cmd.right : Cmd.left;
  if (Math.abs(dx) * 2 < SNAG_WIDTH_PX + opp.w && gapY < SNAG_RANGE_PX) return dy >= 0 ? Cmd.down : Cmd.up;
  return 0;
}

/** True when the two boxes overlap (the Snag rope would start behind the foe). */
function boxesOverlap(a: FighterView, b: FighterView): boolean {
  return Math.abs(b.x + b.w / 2 - (a.x + a.w / 2)) * 2 < a.w + b.w && Math.abs(b.y + b.h / 2 - (a.y + a.h / 2)) * 2 < a.h + b.h;
}

/** A melee hero closes in on a rooted foe until its Manhattan distance (corner to corner, px) is under this (WP-snag-tune). */
const SNAG_CLOSE_PX = 100;

/** Within this Manhattan distance (px) a tag team's AI may skip an attack press (see `decide`). */
const CLOSE_PX = 160;

export class ArcadeTactics {
  /**
   * Memory (`W.tick` based): [0] the tick the current opponent stun was first seen (-1: none) and [1] the reaction
   * drawn for it; [2] the tick the current threat was first seen (-1: none), [3] its reaction, [4] its plan (PARRY,
   * DODGE, GUARD or NO_PLAN) and [5] how many game ticks before the hit it acts; [6] the personality (-1 until the
   * first Arcade tick); [7] the movement bits of a slide round a rock and [8] the `W.tick` it is held until; [9] the tick the total HP on the field last changed and [10] that total (the anti-stalemate clock); [11] the `W.tick` of the last guard reflex and [12] whether the current threat's reflex is armed; [13] the opponent's distance (`centreDist`) last tick (-1: none; the trap rule's closing test); [14] the `W.tick` until which it presses a foe its Puddle holds or its Gust shoved (WP 39f); [15] the count of own Gusts seen last tick; [16] the defence fatigue (consecutive defended threats), [17] the tick a threat was last seen, [18] the tick the fatigue last rose and [19] the own HP last tick (a drop resets the fatigue; 0 in all four is fresh).
   */
  private mem: Memory = [...FRESH];
  private readonly rng = new AgentRng(ARCADE_AI_STREAM_NAMES);

  /**
   * `level` picks the ARCADE_AI_KNOBS row; `style` is a personality (RUSHDOWN, ZONER, TURTLE), or none to draw one on
   * the first Arcade tick (Turtle when `unfavourable`: its element is at a disadvantage against the opponent's, which
   * is also the weather rule).
   */
  constructor(
    private readonly level: ArcadeAiLevel = AI_NORMAL,
    private readonly style?: Style,
    private readonly unfavourable = false,
    /** What the hero's two ability slots do (omni, heal, hop, hide); absent or `none`: left as the Classic AI chose. */
    private readonly kit: readonly [KitKind, KitKind] = ['none', 'none'],
  ) {}

  /**
   * The Arcade version of `cmd` for `view`; `cmd` itself, with no draw, when the view has no `arcade` (Classic). `shot`
   * is the attack bit of a projectile slot that can fire now (0: none), used for a diagonal shot.
   */
  apply(view: ObservationView, base: Command, shot: Command = 0): Command {
    const a = view.arcade;
    if (a === undefined) return base;
    // Easy opening grace (SIM_VERSION 97): starts on each round's first fight tick, ends early when the AI hero is hit.
    if (a.phase !== RoundPhase.fight) this.mem[Mem.openAt] = view.tick + 1;
    else if (view.self !== undefined && view.self.hp < this.mem[Mem.lastHp]) this.mem[Mem.openAt] = -1000;
    const cmd = this.avoidTraps(view, a, this.kitUse(view, a, this.decide(view, a, base, shot)));
    const out = avoidChord(a, a.rocks.length === 0 || view.self === undefined || view.opponent === undefined ? cmd : this.slide(view.tick, view.self, view.opponent, a.rocks, cmd, a.partnerPm >= 0));
    const zoned = this.hazard(view, a, this.runStep(view, a, this.wallHoldStep(view, a, this.zone(view, a, out))));
    // A held charge bit never makes a new press: one pressed in the intro (no action then) is dropped, and holding it on makes both
    // melee heroes stand forever (1v1 Arcade stalemates from tick 0). Release for a tick after a press so the next one is an edge.
    const released = (zoned & Cmd.charge) !== 0 && (a.prevCmd & Cmd.charge) !== 0 ? zoned & ~Cmd.charge : zoned;
    const withElem = this.elemental(view, a) ? released | Cmd.elemental : released;
    const full = this.cleanse(view, a) ? withElem | Cmd.cleanse : withElem;
    // Crowd control (flag withCrowdControl; a no-op without `selfCc` / `slotCc`): mash out of a daze, quick-rise from a knockdown,
    // and never press an ability whose CC rider the foe is immune to.
    const escape = ccEscape(this.level, a);
    if (escape !== -1) return escape;
    const final = ccAvoidImmune(this.level, a, full, [slotReady(view, 0, a.snagSlot), slotReady(view, 1, a.snagSlot)]);
    return easyOpening(this.level, view.tick, this.mem[Mem.openAt]) ? final & ~ARCADE_AI_EASY_OPENING_MASK : final;
  }

  /**
   * Kit use (C1): the Classic AI presses every ready secondary and never a non-attack primary, so a ring, a heal, a hop or an armour
   * went off at random. Here each is gated on its moment (see KitKind) and, for the ones that need the foe near, pressed when
   * it is; no draw, no memory. Dash, guard, super, charge and trap commands, the Snag slot and a stunned or frozen hero are left alone.
   */
  private kitUse(view: ObservationView, a: ArcadeView, cmd: Command): Command {
    const self = view.self;
    const opp = view.opponent;
    if (self === undefined || opp === undefined || (this.kit[0] === 'none' && this.kit[1] === 'none')) return cmd;
    // A stale fight (no HP change for ARCADE_AI_STALE_TICKS) gets the Classic AI's presses back: a gated kit must never hold a stalemate.
    if (view.tick - this.mem[Mem.hpChangeAt] >= ARCADE_AI_STALE_TICKS) return cmd;
    const far = Math.abs(opp.x - self.x) + Math.abs(opp.y - self.y);
    const threat = soonestShot(self, a.shots, ARCADE_AI_LOOKAHEAD) !== undefined;
    const field = arcadePlayfield();
    const cornered =
      self.x - field.x < ARCADE_AI_KIT_CORNER_PX || field.x + field.w - (self.x + self.w) < ARCADE_AI_KIT_CORNER_PX ||
      self.y - field.y < ARCADE_AI_KIT_CORNER_PX || field.y + field.h - (self.y + self.h) < ARCADE_AI_KIT_CORNER_PX;
    const busy = (cmd & (Cmd.dash | Cmd.guard | Cmd.super | Cmd.charge | Cmd.trap)) !== 0;
    const can = a.selfStun === 0 && !a.superActive && (self.flags & EntityFlag.frozen) === 0 && !busy && a.phase === RoundPhase.fight;
    let out = cmd;
    for (let slot = 0; slot < 2; slot++) {
      const kind = this.kit[slot];
      if (kind === undefined || kind === 'none' || slot === a.snagSlot) continue;
      const bit = slot === 0 ? Cmd.primary : Cmd.secondary;
      const want =
        kind === 'omni' ? far < ARCADE_AI_KIT_OMNI_PX
        : kind === 'heal' ? self.hp * 1000 < ARCADE_AI_KIT_HEAL_BELOW_PM * self.maxHp && !threat
        : kind === 'hop' ? far < ARCADE_AI_KIT_HOP_PX || (cornered && far < ARCADE_AI_KIT_CORNER_FOE_PX)
        : far < ARCADE_AI_KIT_HIDE_PX;
      if (!want) out &= ~bit;
      else if (can && kind !== 'heal' && (view.cooldowns[slot] ?? 1) === 0) out |= bit;
    }
    return out;
  }

  /**
   * Zoning (SIM_VERSION 44; Normal and Hard; ideas/brainstorm/ranged-heroes-fight-at-melee-range): the last word on a ranged
   * Zoner's or Turtle's walk (Rushdown, and any hero in a stale fight, still closes in). In the fight and free, a command that
   * is not a dash, guard, super, charge or trap press loses its step towards the foe along the dominant axis inside the zoning
   * band (`zoneStep`), so a ranged hero fires from range and stays out of arm's reach, whatever rule (a rock slide, a combo
   * step, a dodge) asked for the step. Shots keep their line: the shot auto-faces the foe. Off while the hero has a living partner to tag in
   * (`partnerPm >= 0`, SIM_VERSION 48): two ranged heroes a side kept each other out of range and 2v2 rounds ran to the timer.
   */
  private zone(view: ObservationView, a: ArcadeView, cmd: Command): Command {
    const self = view.self;
    const opp = view.opponent;
    if (self === undefined || opp === undefined || this.level < AI_NORMAL || a.chargeIn !== -1 || a.partnerPm >= 0) return cmd;
    if (a.phase !== RoundPhase.fight || a.selfStun !== 0 || a.superActive || (self.flags & EntityFlag.frozen) !== 0) return cmd;
    if (view.tick - this.mem[Mem.hpChangeAt] >= ARCADE_AI_STALE_TICKS || (cmd & (Cmd.dash | Cmd.guard | Cmd.super | Cmd.charge | Cmd.trap | Cmd.run)) !== 0) return cmd;
    return zoneStep(self, opp, cmd, arcadePlayfield(), a.oppStun !== 0 || a.oppRooted !== 0);
  }

  /**
   * Wall hold (SIM_VERSION 85, Hard only): the last word on the walk of a free Hard hero whose foe is pinned at a side wall
   * (`wallHold`): it keeps a gap, steps out of any overlap even while the foe is stunned or rooted, and stops walking in. Off in the
   * intro, while stunned, frozen or in a super, after ARCADE_AI_STALE_TICKS without damage (the stalemate escape), and for a dash,
   * guard, super, charge or trap command. No draw and no memory, so the other rules draw as before; Normal and Easy are untouched.
   */
  private wallHoldStep(view: ObservationView, a: ArcadeView, cmd: Command): Command {
    const self = view.self;
    const opp = view.opponent;
    if (self === undefined || opp === undefined || this.level < AI_HARD || a.phase !== RoundPhase.fight) return cmd;
    if (a.selfStun !== 0 || a.superActive || (self.flags & EntityFlag.frozen) !== 0) return cmd;
    if (view.tick - this.mem[Mem.hpChangeAt] >= ARCADE_AI_STALE_TICKS || (cmd & (Cmd.dash | Cmd.guard | Cmd.super | Cmd.charge | Cmd.trap)) !== 0) return cmd;
    return wallHold(self, opp, cmd, arcadePlayfield(), a.chargeIn === -1);
  }

  /**
   * Run Away / Run Towards (SIM_VERSION 89, FUN-DESIGN 2.29; Normal and Hard, never Easy; no draw, so no other rule's draw moves). Not
   * running: a free hero with Run ready presses it (a ranged hero when the foe is within ARCADE_AI_RUN_NEAR_PX and it is not cornered, never
   * Rushdown and never in a stale fight; a melee hero from CHARGE_AI_MIN_DIST while its Charge is on cooldown), never onto a stunned foe or
   * on a command that is a dash, guard, super, charge, trap, tag or weather press. The press carries no direction (a rising direction on
   * the same tick would win over the run). Running: no direction bits (they would break it), attacks go on; a ranged run ends with
   * one direction press (the base AI's own, else one towards the foe) when the foe is past ARCADE_AI_RUN_FAR_PX, the hero is cornered or has not
   * moved for ARCADE_AI_RUN_STILL_TICKS free ticks, and any run ends so when the foe is stunned (the combo rules take over).
   */
  private runStep(view: ObservationView, a: ArcadeView, cmd: Command): Command {
    const self = view.self;
    const opp = view.opponent;
    const m = this.mem;
    if (self === undefined || opp === undefined || a.runIn === undefined) return cmd;
    const running = a.running === true;
    const free = a.selfStun === 0 && !a.superActive && (self.flags & EntityFlag.frozen) === 0 && a.selfRooted === 0;
    if (running && free && a.freeze === 0) m[Mem.runStill] = self.x === m[Mem.runX] && self.y === m[Mem.runY] ? m[Mem.runStill] + 1 : 0;
    else if (!running) m[Mem.runStill] = 0;
    m[Mem.runX] = self.x;
    m[Mem.runY] = self.y;
    if (this.level < AI_NORMAL) return cmd;
    const busy = (cmd & (Cmd.dash | Cmd.guard | Cmd.super | Cmd.charge | Cmd.trap | Cmd.swap1 | Cmd.swap2 | Cmd.weather)) !== 0;
    const dist = centreDist(self, opp);
    const away = a.runAway === true;
    if (running) {
      if (busy) return cmd;
      const stop = a.oppStun !== 0 || (away && (dist > ARCADE_AI_RUN_FAR_PX || m[Mem.runStill] >= ARCADE_AI_RUN_STILL_TICKS || runCornered(self, opp, arcadePlayfield())));
      if (!stop) return cmd & ~MOVE;
      m[Mem.runStill] = 0;
      return (cmd & MOVE) !== 0 ? cmd : cmd | (toward(self, opp) || Cmd.left);
    }
    if (busy || a.runIn !== 0 || (a.prevCmd & Cmd.run) !== 0 || a.phase !== RoundPhase.fight || !free || a.oppStun !== 0) return cmd;
    if (view.tick - m[Mem.hpChangeAt] >= ARCADE_AI_STALE_TICKS) return cmd;
    const want = away
      ? dist <= ARCADE_AI_RUN_NEAR_PX && m[Mem.style] !== RUSHDOWN && !runCornered(self, opp, arcadePlayfield())
      : a.chargeIn > 0 && dist >= CHARGE_AI_MIN_DIST;
    return want ? (cmd & ~MOVE) | Cmd.run : cmd;
  }

  /**
   * Hazard dodge (stage hazards, systems/arcade/hazard.ts): while a hazard warns (`strikeIn > 0`) and at least the level's
   * reaction (ARCADE_AI_KNOBS[0], counted in game ticks from the warning's start) has passed, a free, unrooted fighter in
   * the fight replaces its movement with the shortest way out of the warned box (`hazardExit`; attacks ride along, the
   * aim auto-faces the foe), or, outside it, drops a step into it (`hazardKeepOut`). A guard, dash, super, charge or trap
   * command is left alone, and Easy acts only in the first half of every 256 ticks (ARCADE_AI_EASY_TRAP_BLIND). The tide's
   * box is the whole field, so it changes nothing there. No draw and no memory, so the other rules draw as before.
   */
  private hazard(view: ObservationView, a: ArcadeView, cmd: Command): Command {
    const self = view.self;
    const hz = a.hazard;
    if (self === undefined || hz === undefined || hz.strikeIn === 0 || a.phase !== RoundPhase.fight) return cmd;
    if (a.selfStun !== 0 || a.superActive || a.selfRooted !== 0 || (self.flags & EntityFlag.frozen) !== 0) return cmd;
    if ((cmd & (Cmd.dash | Cmd.guard | Cmd.super | Cmd.charge | Cmd.trap | Cmd.run)) !== 0) return cmd;
    if (this.level === AI_EASY && (view.tick & 255) >= ARCADE_AI_EASY_TRAP_BLIND) return cmd;
    if (hazardWarnTicks(hz.kind) - hz.strikeIn < ARCADE_AI_KNOBS[this.level][0]) return cmd;
    const exit = hazardExit(self, hz, arcadePlayfield());
    return (cmd & ~MOVE) | (exit !== 0 ? exit : hazardKeepOut(self, hz, cmd & MOVE));
  }

  /**
   * The elemental press (FUN-DESIGN 2.24, `elementalSensible`): in the fight, free (not stunned, not in its super, not
   * frozen) and a fresh press (the bit was up last tick, so a held bit never swallows the edge). It rides on any command.
   */
  private elemental(view: ObservationView, a: ArcadeView): boolean {
    const self = view.self;
    const opp = view.opponent;
    if (self === undefined || opp === undefined || a.phase !== RoundPhase.fight || (a.prevCmd & Cmd.elemental) !== 0) return false;
    if (a.selfStun !== 0 || a.superActive || (self.flags & EntityFlag.frozen) !== 0) return false;
    return elementalSensible(this.level, a, (self.hp * 1000) / self.maxHp, centreDist(self, opp));
  }

  /** The common Cleanse press (`cleanseSensible`): in the fight, free, and a fresh press (the bit was up last tick). */
  private cleanse(view: ObservationView, a: ArcadeView): boolean {
    const self = view.self;
    if (self === undefined || a.phase !== RoundPhase.fight || (a.prevCmd & Cmd.cleanse) !== 0) return false;
    if (a.selfStun !== 0 || a.superActive || (self.flags & EntityFlag.frozen) !== 0) return false;
    return cleanseSensible(this.level, a, (self.hp * 1000) / self.maxHp);
  }

  /**
   * Rock avoidance (FUN-DESIGN 2.15; `a.rocks` is empty for an earth fighter, which walks over them). A move whose next
   * step would enter a rock, or an attack along a line a rock cuts (the shot would be wasted), starts a slide: the
   * movement along the other axis towards the nearer free side of the rock (up or left on a tie), kept together with
   * the move along the blocked axis and held ARCADE_AI_SLIDE_TICKS ticks (so the base AI's alignment cannot pull it
   * straight back), ending early when the step is not free. A fighter already inside a rock walks out as it is. Guard
   * and super commands are left alone; a dash that would run into a rock loses its dash bit and is slid as a walk.
   * SIM_VERSION 83 (Hard only; Normal and Easy keep the point test): a step is tested as the box swept over the whole look-ahead (a real step of 1-3 px can touch a rock corner
   * the 8 px end box clears, which wedged fighters), and a wall only needs ARCADE_AI_WALL_PROBE px of room (walls slide).
   */
  private slide(tick: number, self: FighterView, opp: FighterView, rocks: readonly RockView[], cmd: Command, tagTeam: boolean): Command {
    // Normal and Easy keep the SIM 82 point test (the balance numbers are tuned on it); only Hard sweeps.
    const hard = this.level >= AI_HARD;
    if ((cmd & (hard ? Cmd.guard | Cmd.super : Cmd.guard | Cmd.dash | Cmd.super)) !== 0 || rocks.some((r) => hitsRock(r, self.x, self.y, self.w, self.h))) return cmd;
    const [cx, cy] = stepOf(cmd & MOVE);
    if ((cmd & Cmd.dash) !== 0) {
      // A dash into a rock is reverted every tick (SIM_VERSION 83): walk it round the rock instead.
      if (!rocks.some((r) => sweptHits(r, self.x, self.y, self.w, self.h, cx, cy))) return cmd;
      cmd &= ~Cmd.dash;
    }
    const m = this.mem;
    const pf = arcadePlayfield();
    const free = (bits: Command): boolean => {
      const [dx, dy] = stepOf(bits);
      const x = self.x + (hard ? Math.sign(dx) * ARCADE_AI_WALL_PROBE : dx);
      const y = self.y + (hard ? Math.sign(dy) * ARCADE_AI_WALL_PROBE : dy);
      return x >= pf.x && y >= pf.y && x + self.w <= pf.x + pf.w && y + self.h <= pf.y + pf.h && !rocks.some((r) => (hard ? sweptHits(r, self.x, self.y, self.w, self.h, dx, dy) : hitsRock(r, x, y, self.w, self.h)));
    };
    // A tag team (a living partner) shoots on from SHOOT_FROM of every 256 ticks even along a line a rock cuts: two sides
    // that both refuse a wasted shot and slide about can otherwise never trade a hit (2v2 stalemates).
    const shoots = tagTeam && (tick & 255) >= SHOOT_FROM;
    const wasted = (cmd & ATTACK) !== 0 && !shoots ? rockOnLine(self, opp, rocks) : undefined;
    const out = (bits: Command): Command => (cmd & ~(MOVE | (wasted !== undefined ? ATTACK : 0))) | bits;
    if (m[Mem.slideBits] !== 0 && tick < m[Mem.slideUntil] && free(m[Mem.slideBits])) return out(m[Mem.slideBits]);
    m[Mem.slideBits] = 0;
    const [sx, sy] = [cx, cy];
    const blocker = sx === 0 && sy === 0 ? undefined : rocks.find((r) => (hard ? sweptHits(r, self.x, self.y, self.w, self.h, sx, sy) : hitsRock(r, self.x + sx, self.y + sy, self.w, self.h)));
    const rock = blocker ?? wasted;
    if (rock === undefined) return cmd;
    // The axis of the move (the opponent's side when standing still) and the other axis to slide along.
    const dxo = opp.x + opp.w / 2 - (self.x + self.w / 2);
    const horizontal = sx !== 0 || (sy === 0 && Math.abs(dxo) >= Math.abs(opp.y - self.y));
    const keep = horizontal ? (sx !== 0 ? cmd & (Cmd.left | Cmd.right) : dxo > 0 ? Cmd.right : Cmd.left) : cmd & (Cmd.up | Cmd.down);
    const [lo, hi] = horizontal ? [Cmd.up, Cmd.down] : [Cmd.left, Cmd.right];
    const toLo = horizontal ? self.y + self.h - rock.y : self.x + self.w - rock.x;
    const toHi = horizontal ? rock.y + rock.h - self.y : rock.x + rock.w - self.x;
    const [first, second] = toLo <= toHi ? [lo, hi] : [hi, lo];
    for (const bits of [keep | first, first, keep | second, second]) {
      if (!free(bits)) continue;
      m[Mem.slideBits] = bits;
      m[Mem.slideUntil] = tick + ARCADE_AI_SLIDE_TICKS;
      return out(bits);
    }
    return cmd;
  }

  /**
   * Trap avoidance (WP 39c): a move whose next step enters a foe trap's trigger square becomes a dash across it (Normal
   * and Hard, a Fire Bomb or Spike that arms after the dash, the dash ready) or a lateral nudge round it (`trapNudge`).
   * Guard, dash, super and charge commands are left alone, Easy walks on in the second half of every 256 ticks, and
   * everyone walks on in a stale fight (ARCADE_AI_STALE_TICKS without an HP change).
   */
  private avoidTraps(view: ObservationView, a: ArcadeView, cmd: Command): Command {
    const self = view.self;
    if (self === undefined || a.traps.length === 0 || (cmd & (Cmd.guard | Cmd.dash | Cmd.super | Cmd.charge)) !== 0) return cmd;
    if (this.level === AI_EASY && (view.tick & 255) >= ARCADE_AI_EASY_TRAP_BLIND) return cmd;
    // A stale fight walks on through foe traps: two sides stepping round traps can otherwise never trade a hit.
    if (view.tick - this.mem[Mem.hpChangeAt] >= ARCADE_AI_STALE_TICKS) return cmd;
    const t = trapOnStep(self, a.traps, cmd);
    if (t === undefined) return cmd;
    if (a.dashIn === 0 && a.selfStun === 0 && trapDashable(this.level, t)) return Cmd.dash | (cmd & MOVE);
    return (cmd & ~MOVE) | trapNudge(self, a.traps, t, cmd, arcadePlayfield());
  }

  /**
   * Follow-up memory (WP 39f): opens the press window [14] when the foe stands in an own armed Puddle, or when the count
   * of own Gusts [15] fell since last tick (one fired and shoved the foe, or dried up or was doused: a press that costs
   * little). Runs every Arcade tick.
   */
  private followUp(tick: number, a: ArcadeView, opp: FighterView): void {
    const m = this.mem;
    const gusts = a.traps.filter((t) => t.own && t.kind === TrapKind.gust).length;
    // Outside a fight (the round reset clears every trap, so the Gust count drops to 0 then) a window never opens and a
    // leftover one is dropped: no spurious press at the start of a round (SIM_VERSION 38).
    if (a.phase !== RoundPhase.fight) {
      m[Mem.pressUntil] = 0;
      m[Mem.gusts] = gusts;
      return;
    }
    if (gusts < m[Mem.gusts]) m[Mem.pressUntil] = tick + ARCADE_AI_PRESS_GUST_TICKS;
    m[Mem.gusts] = gusts;
    if (foeInOwnPuddle(opp, a.traps)) m[Mem.pressUntil] = Math.max(m[Mem.pressUntil], tick + ARCADE_AI_PRESS_PUDDLE_TICKS);
  }

  /** True when a trap press now plants: free (the caller checks), ready, under the team cap, a fresh press, a free spot. */
  private canPlant(self: FighterView, opp: FighterView, a: ArcadeView): boolean {
    return a.trapIn === 0 && a.trapCount < TRAP_TEAM_MAX && (a.prevCmd & Cmd.trap) === 0 && trapSpotFree(self, opp, a.traps, arcadePlayfield());
  }

  private decide(view: ObservationView, a: ArcadeView, base: Command, shot: Command): Command {
    const self = view.self;
    const opp = view.opponent;
    if (self === undefined || opp === undefined) return base;
    const m = this.mem;
    const k = ARCADE_AI_KNOBS[this.level];
    const draw = (n: number): number => this.rng.int(view, n);
    const react = (): number => k[0] + draw(k[1]);
    if (m[Mem.style] < 0) m[Mem.style] = this.style ?? (this.unfavourable ? TURTLE : draw(3));
    // Anti-stalemate: no HP change for ARCADE_AI_STALE_TICKS and Zoner/Turtle play Rushdown (no retreat, close in and charge).
    if (m[Mem.hpSum] !== self.hp + opp.hp) {
      m[Mem.hpChangeAt] = view.tick;
      m[Mem.hpSum] = self.hp + opp.hp;
    }
    const quiet = view.tick - m[Mem.hpChangeAt];
    const stale = quiet >= ARCADE_AI_STALE_TICKS;
    const stale2 = quiet >= ARCADE_AI_STALE2_TICKS;
    const stale3 = quiet >= ARCADE_AI_STALE3_TICKS;
    const style = stale ? RUSHDOWN : (m[Mem.style] as Style);
    const dist = centreDist(self, opp);
    // A stale fight presses: no zoning or corner plant then (a planted trap holds the planter and turns the foe away).
    const found = trapReason(this.level, style, self, opp, dist, m[Mem.lastDist], a.oppRooted, arcadePlayfield());
    const reason = stale && found !== TRAP_ROOT ? TRAP_NONE : found;
    m[Mem.lastDist] = dist;
    this.followUp(view.tick, a, opp);
    const line = shot === 0 || (base & ATTACK) !== 0 ? 0 : diagonalLine(self, opp);
    const axisShot = (base & ATTACK) !== 0 && (base & (Cmd.left | Cmd.right)) !== 0;
    let cmd = line !== 0 ? (base & ~MOVE) | line | shot : axisShot ? base & ~(Cmd.up | Cmd.down) : base;
    const far = Math.abs(opp.x - self.x) + Math.abs(opp.y - self.y);
    const free = a.selfStun === 0 && !a.superActive && (self.flags & EntityFlag.frozen) === 0;
    // Snag (FUN-DESIGN 2.20): the Classic AI never presses the Snag slot (it would waste the long cooldown); `snag` is the
    // throw when it is ready, the opponent is in a lane in range, not guarding, not rooted and not immune.
    const snagBit = a.snagSlot === 0 ? Cmd.primary : a.snagSlot === 1 ? Cmd.secondary : 0;
    cmd &= ~snagBit;
    const lane = snagBit === 0 || (view.cooldowns[a.snagSlot] ?? 1) !== 0 || a.oppGuarding || a.oppRooted > 0 || a.oppRootImmune > 0 ? 0 : snagLane(self, opp);

    // Defence fatigue bookkeeping: a hit on this hero, or a quiet spell without a threat, makes the next defence fresh.
    // Hard (SIM_VERSION 82): only a real hit (hit-stun) resets it; guard chip, damage over time and hazards do not.
    if (this.level >= AI_HARD ? a.selfStun > 0 : self.hp < m[Mem.lastHp]) m[Mem.fatigue] = 0;
    m[Mem.lastHp] = self.hp;
    // Defence: the soonest hit among the enemy shots; one reaction delay and one plan per threat.
    const soon = soonestShot(self, a.shots, ARCADE_AI_LOOKAHEAD);
    const t = soon?.t ?? ARCADE_AI_LOOKAHEAD + 1;
    const threat = soon !== undefined;
    if (!threat) {
      m[Mem.threatSince] = -1;
      if (view.tick - m[Mem.fatigueAt] >= ARCADE_AI_FATIGUE_RESET_TICKS) m[Mem.fatigue] = 0;
    } else {
      m[Mem.fatigueAt] = view.tick;
      if (m[Mem.threatSince] < 0) {
        const rates = ARCADE_AI_STYLES[style];
        let r = draw(1000) * 1000;
        let plan = PARRY;
        // Defence fatigue (SIM_VERSION 80): every defended threat in a row (at most one per window) blunts the next plan.
        const fatigue = fatigueScale(this.level, m[Mem.fatigue]);
        const scale = ((stale2 ? 500 : 1000) * fatigue) / 1000;
        while (plan < NO_PLAN && (r -= ((rates[plan] ?? 0) * (k[2 + plan] ?? 0) * scale) / 1000) >= 0) plan++;
        if (stale3) plan = NO_PLAN;
        m[Mem.threatSince] = view.tick;
        m[Mem.threatReact] = react();
        m[Mem.plan] = plan;
        m[Mem.reflexOk] = draw(1000) < k[7] && !stale2 && m[Mem.fatigue] < ARCADE_AI_FATIGUE_REFLEX_MAX ? 1 : 0;
        if (plan !== NO_PLAN && this.level > AI_EASY && view.tick - m[Mem.fatigueWindowAt] >= ARCADE_AI_FATIGUE_WINDOW) {
          m[Mem.fatigue] = m[Mem.fatigue] + 1;
          m[Mem.fatigueWindowAt] = view.tick;
        }
        m[Mem.guardAt] = plan === PARRY ? 2 + draw(k[5]) : plan === DODGE ? ARCADE_AI_DODGE_AT : ARCADE_AI_GUARD_AT;
      }
      if (free && m[Mem.plan] < NO_PLAN && view.tick - m[Mem.threatSince] >= m[Mem.threatReact]) {
        if (t <= m[Mem.guardAt]) {
          if (m[Mem.plan] !== DODGE || a.dashIn !== 0) return Cmd.guard;
          const side = this.level >= AI_HARD ? sidestepBit(self, soon.shot, arcadePlayfield()) : 0;
          return Cmd.dash | (side !== 0 ? side : toward(self, opp));
        }
      }
      if (free && this.level > 0 && m[Mem.reflexOk] === 1 && (soon.shot.vx !== 0 || soon.shot.vy !== 0) && guardReflex(t, view.tick, m[Mem.reflexAt], true)) {
        m[Mem.reflexAt] = view.tick;
        return Cmd.guard;
      }
    }

    if (a.oppStun === 0) m[Mem.superSince] = -1;
    else {
      if (m[Mem.superSince] < 0) {
        m[Mem.superSince] = view.tick;
        m[Mem.superReact] = react();
      }
      const facing = superFacing(self, opp, a.superId);
      if (free && this.level > 0 && a.meter >= SUPER_COST && facing !== 0 && view.tick - m[Mem.superSince] >= m[Mem.superReact]) {
        return (cmd & ~(MOVE | ATTACK)) | facing | Cmd.super;
      }
      if (a.combo > this.level * 2) cmd &= ~ATTACK;
      else if (free && this.level > AI_EASY && a.chargeIn === 0 && far >= CHARGE_AI_MIN_DIST) return Cmd.charge;
      else {
        const pressed = pressStep(self, opp, cmd);
        // Follow-up (Normal and Hard): the base AI has no attack lined up but a slot is ready. A ranged hero steps onto the foe's
        // line (it is still for the stun); a melee hero closes in, never onto its body (SNAG_CLOSE_PX).
        if (pressed !== cmd || this.level === AI_EASY || (cmd & ATTACK) !== 0 || !(slotReady(view, 0, a.snagSlot) || slotReady(view, 1, a.snagSlot))) cmd = pressed;
        else if (a.chargeIn === -1) cmd = alignStep(self, opp, cmd);
        else if (far >= SNAG_CLOSE_PX) cmd = (cmd & ~MOVE) | toward(self, opp);
      }
    }
    // A rooted foe cannot walk out of a super (Hard).
    if (free && this.level >= AI_HARD && a.oppRooted > 0 && a.meter >= SUPER_COST && !threat) {
      const facing = superFacing(self, opp, a.superId);
      if (facing !== 0) return (cmd & ~(MOVE | ATTACK)) | facing | Cmd.super;
    }
    // Tag team, point blank: both sides firing on the same tick clash their shots (no damage) every time, a lockstep loop
    // (2v2 stalemates); a drawn one-in-four skip of the press breaks the symmetry. In 1v1 only once the fight is stale (stage 2).
    if ((a.partnerPm >= 0 || stale2) && (cmd & ATTACK) !== 0 && a.oppStun === 0 && far < CLOSE_PX && draw(4) === 0) {
      cmd &= ~ATTACK;
    }
    // Stage 2: a stale fight walks in even with a shot on the way (the defence only ever retreated).
    if (stale2 && free && threat && (cmd & MOVE) === 0) cmd |= toward(self, opp);
    if (!free || threat) return cmd;
    // Hard never stands inside the foe (no pushbox): overlapped boxes step apart, the attack still goes out (QA r66/r67 wall pin).
    if (this.level >= AI_HARD && a.oppStun === 0 && a.oppRooted === 0) {
      const apart = stepApart(self, opp, arcadePlayfield());
      if (apart !== 0) return (cmd & ~MOVE) | apart;
    }
    // Easy and Normal: a stale fight with the boxes overlapped (typically both stuck in a wall corner): step apart so a hit can land.
    if (stale && a.oppStun === 0 && a.oppRooted === 0) {
      const apart = stepApart(self, opp, arcadePlayfield());
      if (apart !== 0) return (cmd & ~(MOVE | ATTACK)) | apart;
    }
    if (lane !== 0) return (cmd & ~(MOVE | ATTACK)) | lane | snagBit;
    // Stage 3: nothing is held back any more; super, Charge (whatever the foe's guard), a trap and a dash in.
    if (stale3 && a.oppStun === 0) {
      const facing = a.meter >= SUPER_COST ? superFacing(self, opp, a.superId) : 0;
      if (facing !== 0) return (cmd & ~(MOVE | ATTACK)) | facing | Cmd.super;
      if (a.chargeIn === 0 && far >= CHARGE_AI_MIN_DIST) return Cmd.charge;
      if (this.canPlant(self, opp, a)) return plant(cmd);
      if (a.dashIn === 0 && far > ARCADE_AI_FAR_PX) return (cmd & ~MOVE) | Cmd.dash | toward(self, opp);
    }
    // Snag ready but the boxes overlap: step away to open a gap for the throw (else two Snag heroes freeze in place).
    if (snagBit !== 0 && (view.cooldowns[a.snagSlot] ?? 1) === 0 && !a.oppGuarding && a.oppRooted === 0 && a.oppRootImmune === 0 && boxesOverlap(self, opp)) {
      return (cmd & ~(MOVE | ATTACK)) | (opp.x + opp.w / 2 >= self.x + self.w / 2 ? Cmd.left : Cmd.right);
    }
    // A rooted foe cannot walk off a trap planted on it (Hard; no draw).
    if (reason === TRAP_ROOT && this.canPlant(self, opp, a)) return plant(cmd);
    // Follow-up (WP 39f, Normal and Hard): press a foe held by its Puddle or shoved by its Gust (a Charge, else close in).
    if (this.level > AI_EASY && view.tick < m[Mem.pressUntil] && a.oppStun === 0 && a.oppRooted === 0) {
      if (a.chargeIn === 0 && far >= CHARGE_AI_MIN_DIST && !a.oppGuarding) return Cmd.charge;
      if ((cmd & ATTACK) === 0 && far >= (a.chargeIn === -1 ? ARCADE_AI_PRESS_RANGED_PX : SNAG_CLOSE_PX)) return (cmd & ~MOVE) | toward(self, opp);
    }
    // Counter (Hard): a fire shot douses a foe Puddle or Gust between the two (the shot auto-faces the foe).
    if (this.level >= AI_HARD && a.fireShot && shot !== 0 && a.snagSlot !== 0 && trapToDouse(self, opp, a.traps)) {
      return (cmd & ~(MOVE | ATTACK)) | shot;
    }
    // A rooted opponent cannot walk away: a melee hero closes in (a Charge from afar).
    // Not onto its body: a melee box starts at the edge, so two overlapped fighters never hit (stalemates); stop at SNAG_CLOSE_PX.
    if (a.oppRooted > 0 && a.chargeIn !== -1 && far >= SNAG_CLOSE_PX) {
      return a.chargeIn === 0 && far >= CHARGE_AI_MIN_DIST ? Cmd.charge : (cmd & ~MOVE) | toward(self, opp);
    }
    const pm = (self.hp * 1000) / self.maxHp;
    // Tags in the healthier bench hero (3v3: Tag 2 when the other one is healthier; WP-arcade-3v3).
    const tag = tagChoice(this.level, a.tagIn, pm, a.partnerPm, a.partner2Pm);
    if (tag !== 0) return cmd | (tag === 2 ? Cmd.swap2 : Cmd.swap1);
    // Traps: an approaching foe in the personality's band, or own back to a wall, at the level's rate per tick.
    if (reason !== TRAP_NONE && reason !== TRAP_ROOT && this.canPlant(self, opp, a) && draw(1000) < ARCADE_AI_TRAP_RATE[this.level]) return plant(cmd);
    if (a.chargeIn === 0 && far >= CHARGE_AI_MIN_DIST && chargeSensible(style === RUSHDOWN, a.oppGuarding)) return Cmd.charge;
    if (a.dashIn === 0 && style === RUSHDOWN && far > ARCADE_AI_FAR_PX && draw(1000) < k[6]) {
      return (cmd & ~MOVE) | Cmd.dash | toward(self, opp);
    }
    if (a.weatherIn === 0 && a.weatherCharge >= WEATHER_CHARGE_FULL && weatherSensible(this.level, this.unfavourable, pm)) return cmd | Cmd.weather;
    // Spacing: melee closes in when it has no move (Normal and Hard); a ranged hero backs off from a close foe (Hard; Rushdown never).
    // In a stale fight an idle ranged hero walks at the foe: two ranged heroes off each other's lines otherwise stand forever.
    if (this.level > 0 && (cmd & ATTACK) === 0 && a.oppStun === 0 && a.oppRooted === 0) {
      const ranged = a.chargeIn === -1;
      if (ranged && stale && (cmd & MOVE) === 0) return cmd | toward(self, opp);
      if (!ranged ? (cmd & MOVE) === 0 : this.level >= AI_HARD && style !== RUSHDOWN) {
        const bit = spacingBit(self, opp, ranged, arcadePlayfield());
        if (bit !== 0) return (cmd & ~MOVE) | bit;
      }
    }
    return cmd;
  }

  save(): AgentState {
    return { mem: [...this.mem], rng: this.rng.save() };
  }

  /** Inverse of save(); null resets. Throws on a state that is not a record. */
  load(state: AgentState): void {
    const rec = stateRecord(state ?? { mem: FRESH, rng: null }, 'ArcadeTactics');
    const mem = [...(rec['mem'] as number[])];
    // An older save pads with 0, except `openAt`: no grace (-1000), as a fresh agent first seen mid-round.
    while (mem.length < FRESH.length) mem.push(mem.length === (Mem.openAt as number) ? -1000 : 0);
    this.mem = mem as Memory;
    this.rng.load(rec['rng'] ?? null);
  }
}
