import {
  arcadePlayfield, CHARGE_AI_MIN_DIST, SNAG_RANGE_PX, SNAG_WIDTH_PX, SUPER_CHORD_TICKS, SUPER_COST, TRAP_TEAM_MAX,
  RoundPhase, TrapKind, WEATHER_CHARGE_FULL,
} from '../../data/arcade';
import { SUPER_BURST, SUPER_QUAKE_RING_PX, SUPER_SPECS, SuperShape } from '../../data/arcade-supers';
import { ARCADE_AI_STREAM_NAMES } from '../../rng/streams';
import { Cmd, type Command } from '../../sim/commands';
import { EntityFlag } from '../../sim/state';
import {
  stateRecord, type AgentState, type ArcadeView, type FighterView, type ObservationView, type RockView,
} from '../agent';
import { AgentRng } from '../agent-rng';
import {
  AI_EASY, AI_NORMAL, ARCADE_AI_DODGE_AT, ARCADE_AI_EASY_TRAP_BLIND, ARCADE_AI_FAR_PX, ARCADE_AI_GUARD_AT, ARCADE_AI_KNOBS,
  ARCADE_AI_LOOKAHEAD, ARCADE_AI_PRESS_GUST_TICKS, ARCADE_AI_PRESS_PUDDLE_TICKS, ARCADE_AI_PRESS_RANGED_PX,
  ARCADE_AI_STYLES, ARCADE_AI_TRAP_RATE, DODGE, AI_HARD, NO_PLAN, PARRY, RUSHDOWN, TRAP_NONE, TRAP_ROOT, TURTLE,
  centreDist, chargeSensible, elementalSensible, foeInOwnPuddle, guardReflex, sidestepBit, soonestShot, spacingBit, stepApart, tagChoice, toward, trapDashable, trapNudge,
  trapOnStep, trapReason, trapSpotFree, trapToDouse, weatherSensible, type ArcadeAiLevel, type Style,
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
      ? Math.floor(((SUPER_QUAKE_RING_PX[SUPER_QUAKE_RING_PX.length - 1] ?? 0) * spec.scalePm) / 1000)
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
const LINE_SAMPLES = 16;

const hitsRock = (r: RockView, x: number, y: number, w: number, h: number): boolean =>
  x < r.x + r.w && r.x < x + w && y < r.y + r.h && r.y < y + h;

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

type Memory = [number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number];
const FRESH: Readonly<Memory> = [-1, 0, -1, 0, NO_PLAN, 0, -1, 0, 0, 0, 0, -1000, 0, -1, 0, 0];

/** Game ticks without any HP change on the field after which the AI stops retreating and presses (no stalemates). */
export const ARCADE_AI_STALE_TICKS = 400;

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
   * first Arcade tick); [7] the movement bits of a slide round a rock and [8] the `W.tick` it is held until; [9] the tick the total HP on the field last changed and [10] that total (the anti-stalemate clock); [11] the `W.tick` of the last guard reflex and [12] whether the current threat's reflex is armed; [13] the opponent's distance (`centreDist`) last tick (-1: none; the trap rule's closing test); [14] the `W.tick` until which it presses a foe its Puddle holds or its Gust shoved (WP 39f); [15] the count of own Gusts seen last tick.
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
  ) {}

  /**
   * The Arcade version of `cmd` for `view`; `cmd` itself, with no draw, when the view has no `arcade` (Classic). `shot`
   * is the attack bit of a projectile slot that can fire now (0: none), used for a diagonal shot.
   */
  apply(view: ObservationView, base: Command, shot: Command = 0): Command {
    const a = view.arcade;
    if (a === undefined) return base;
    const cmd = this.avoidTraps(view, a, this.decide(view, a, base, shot));
    const out = avoidChord(a, a.rocks.length === 0 || view.self === undefined || view.opponent === undefined ? cmd : this.slide(view.tick, view.self, view.opponent, a.rocks, cmd, a.partnerPm >= 0));
    // A held charge bit never makes a new press: one pressed in the intro (no action then) is dropped, and holding it on makes both
    // melee heroes stand forever (1v1 Arcade stalemates from tick 0). Release for a tick after a press so the next one is an edge.
    const released = (out & Cmd.charge) !== 0 && (a.prevCmd & Cmd.charge) !== 0 ? out & ~Cmd.charge : out;
    return this.elemental(view, a) ? released | Cmd.elemental : released;
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

  /**
   * Rock avoidance (FUN-DESIGN 2.15; `a.rocks` is empty for an earth fighter, which walks over them). A move whose next
   * step would enter a rock, or an attack along a line a rock cuts (the shot would be wasted), starts a slide: the
   * movement along the other axis towards the nearer free side of the rock (up or left on a tie), kept together with
   * the move along the blocked axis and held ARCADE_AI_SLIDE_TICKS ticks (so the base AI's alignment cannot pull it
   * straight back), ending early when the step is not free. A fighter already inside a rock walks out as it is. Guard,
   * dash and super commands are left alone.
   */
  private slide(tick: number, self: FighterView, opp: FighterView, rocks: readonly RockView[], cmd: Command, tagTeam: boolean): Command {
    if ((cmd & (Cmd.guard | Cmd.dash | Cmd.super)) !== 0 || rocks.some((r) => hitsRock(r, self.x, self.y, self.w, self.h))) return cmd;
    const m = this.mem;
    const pf = arcadePlayfield();
    const free = (bits: Command): boolean => {
      const [dx, dy] = stepOf(bits);
      const x = self.x + dx;
      const y = self.y + dy;
      return x >= pf.x && y >= pf.y && x + self.w <= pf.x + pf.w && y + self.h <= pf.y + pf.h && !rocks.some((r) => hitsRock(r, x, y, self.w, self.h));
    };
    // A tag team (a living partner) shoots on from SHOOT_FROM of every 256 ticks even along a line a rock cuts: two sides
    // that both refuse a wasted shot and slide about can otherwise never trade a hit (2v2 stalemates).
    const shoots = tagTeam && (tick & 255) >= SHOOT_FROM;
    const wasted = (cmd & ATTACK) !== 0 && !shoots ? rockOnLine(self, opp, rocks) : undefined;
    const out = (bits: Command): Command => (cmd & ~(MOVE | (wasted !== undefined ? ATTACK : 0))) | bits;
    if (m[7] !== 0 && tick < m[8] && free(m[7])) return out(m[7]);
    m[7] = 0;
    const [sx, sy] = stepOf(cmd & MOVE);
    const blocker = sx === 0 && sy === 0 ? undefined : rocks.find((r) => hitsRock(r, self.x + sx, self.y + sy, self.w, self.h));
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
      m[7] = bits;
      m[8] = tick + ARCADE_AI_SLIDE_TICKS;
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
    if (view.tick - this.mem[9] >= ARCADE_AI_STALE_TICKS) return cmd;
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
      m[14] = 0;
      m[15] = gusts;
      return;
    }
    if (gusts < m[15]) m[14] = tick + ARCADE_AI_PRESS_GUST_TICKS;
    m[15] = gusts;
    if (foeInOwnPuddle(opp, a.traps)) m[14] = Math.max(m[14], tick + ARCADE_AI_PRESS_PUDDLE_TICKS);
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
    if (m[6] < 0) m[6] = this.style ?? (this.unfavourable ? TURTLE : draw(3));
    // Anti-stalemate: no HP change for ARCADE_AI_STALE_TICKS and Zoner/Turtle play Rushdown (no retreat, close in and charge).
    if (m[10] !== self.hp + opp.hp) {
      m[9] = view.tick;
      m[10] = self.hp + opp.hp;
    }
    const stale = view.tick - m[9] >= ARCADE_AI_STALE_TICKS;
    const style = stale ? RUSHDOWN : (m[6] as Style);
    const dist = centreDist(self, opp);
    // A stale fight presses: no zoning or corner plant then (a planted trap holds the planter and turns the foe away).
    const found = trapReason(this.level, style, self, opp, dist, m[13], a.oppRooted, arcadePlayfield());
    const reason = stale && found !== TRAP_ROOT ? TRAP_NONE : found;
    m[13] = dist;
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

    // Defence: the soonest hit among the enemy shots; one reaction delay and one plan per threat.
    const soon = soonestShot(self, a.shots, ARCADE_AI_LOOKAHEAD);
    const t = soon?.t ?? ARCADE_AI_LOOKAHEAD + 1;
    const threat = soon !== undefined;
    if (!threat) m[2] = -1;
    else {
      if (m[2] < 0) {
        const rates = ARCADE_AI_STYLES[style];
        let r = draw(1000) * 1000;
        let plan = PARRY;
        while (plan < NO_PLAN && (r -= (rates[plan] ?? 0) * (k[2 + plan] ?? 0)) >= 0) plan++;
        m[2] = view.tick;
        m[3] = react();
        m[4] = plan;
        m[12] = draw(1000) < k[7] ? 1 : 0;
        m[5] = plan === PARRY ? 2 + draw(k[5]) : plan === DODGE ? ARCADE_AI_DODGE_AT : ARCADE_AI_GUARD_AT;
      }
      if (free && m[4] < NO_PLAN && view.tick - m[2] >= m[3]) {
        if (t <= m[5]) {
          if (m[4] !== DODGE || a.dashIn !== 0) return Cmd.guard;
          const side = this.level >= AI_HARD ? sidestepBit(self, soon.shot, arcadePlayfield()) : 0;
          return Cmd.dash | (side !== 0 ? side : toward(self, opp));
        }
      }
      if (free && this.level > 0 && m[12] === 1 && (soon.shot.vx !== 0 || soon.shot.vy !== 0) && guardReflex(t, view.tick, m[11], true)) {
        m[11] = view.tick;
        return Cmd.guard;
      }
    }

    if (a.oppStun === 0) m[0] = -1;
    else {
      if (m[0] < 0) {
        m[0] = view.tick;
        m[1] = react();
      }
      const facing = superFacing(self, opp, a.superId);
      if (free && this.level > 0 && a.meter >= SUPER_COST && facing !== 0 && view.tick - m[0] >= m[1]) {
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
    // (2v2 stalemates); a drawn one-in-four skip of the press breaks the symmetry. Never in 1v1.
    if (a.partnerPm >= 0 && (cmd & ATTACK) !== 0 && a.oppStun === 0 && far < CLOSE_PX && draw(4) === 0) {
      cmd &= ~ATTACK;
    }
    if (!free || threat) return cmd;
    // A stale fight with the boxes overlapped (typically both stuck in a wall corner): step apart so a hit can land.
    if (stale && a.oppStun === 0 && a.oppRooted === 0) {
      const apart = stepApart(self, opp, arcadePlayfield());
      if (apart !== 0) return (cmd & ~(MOVE | ATTACK)) | apart;
    }
    if (lane !== 0) return (cmd & ~(MOVE | ATTACK)) | lane | snagBit;
    // Snag ready but the boxes overlap: step away to open a gap for the throw (else two Snag heroes freeze in place).
    if (snagBit !== 0 && (view.cooldowns[a.snagSlot] ?? 1) === 0 && !a.oppGuarding && a.oppRooted === 0 && a.oppRootImmune === 0 && boxesOverlap(self, opp)) {
      return (cmd & ~(MOVE | ATTACK)) | (opp.x + opp.w / 2 >= self.x + self.w / 2 ? Cmd.left : Cmd.right);
    }
    // A rooted foe cannot walk off a trap planted on it (Hard; no draw).
    if (reason === TRAP_ROOT && this.canPlant(self, opp, a)) return plant(cmd);
    // Follow-up (WP 39f, Normal and Hard): press a foe held by its Puddle or shoved by its Gust (a Charge, else close in).
    if (this.level > AI_EASY && view.tick < m[14] && a.oppStun === 0 && a.oppRooted === 0) {
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
    while (mem.length < FRESH.length) mem.push(0);
    this.mem = mem as Memory;
    this.rng.load(rec['rng'] ?? null);
  }
}
