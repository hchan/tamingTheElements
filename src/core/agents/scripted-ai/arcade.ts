import { SUPER_BAND_PX, SUPER_CHORD_TICKS, SUPER_COST } from '../../data/arcade';
import { ARCADE_AI_STREAM_NAMES } from '../../rng/streams';
import { Cmd, type Command } from '../../sim/commands';
import { EntityFlag } from '../../sim/state';
import {
  stateRecord, type AgentState, type ArcadeView, type FighterView, type ObservationView,
} from '../agent';
import { AgentRng } from '../agent-rng';
import {
  AI_NORMAL, ARCADE_AI_DODGE_AT, ARCADE_AI_FAR_PX, ARCADE_AI_TAG_BELOW_PM, ARCADE_AI_TAG_MARGIN_PM, ARCADE_AI_GUARD_AT, ARCADE_AI_KNOBS, ARCADE_AI_LOOKAHEAD, ARCADE_AI_STYLES, DODGE,
  NO_PLAN, PARRY, RUSHDOWN, TURTLE, impactIn, toward, type ArcadeAiLevel, type Style,
} from './arcade-ai';

/**
 * Arcade layer of the scripted AI (FUN-DESIGN 2.11, WP-arcade-ai-basic and WP-arcade-ai-personalities). It only edits
 * the command the Classic AI chose, and only when the view carries `arcade`, so Classic decisions are untouched; its
 * randomness is its own `AgentRng` stream (ARCADE_AI_STREAM_NAMES), drawn only in Arcade.
 *
 * - Combo: the base AI already fires whenever a ready shot lines up, which keeps hitting a stunned (still) opponent.
 *   While the opponent is stunned the layer steps in along the line it shares with it (`pressStep`), so the next shot
 *   flies a shorter way and can land inside the stun; it holds the attack buttons once its own combo reaches the
 *   level's combo cap.
 * - Super: on a confirm (the opponent is stunned) with a full bar (SUPER_COST), after a reaction delay counted from the
 *   first tick it saw that stun, it faces the opponent and presses `Cmd.super`, if the Elemental Burst band would
 *   cover the opponent (never on Easy).
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
 * - Spacing: Rushdown dashes in when the opponent is farther than ARCADE_AI_FAR_PX (inside a combo too, closing in on a
 *   stunned opponent), at the level's rate per tick; Zoner and Turtle leave spacing to the base AI's kiting.
 * - Tag (WP-arcade-tag): free, with no threat and the tag ready, it tags (`Cmd.swap1`) when its HP is below
 *   ARCADE_AI_TAG_BELOW_PM and its partner's is more than ARCADE_AI_TAG_MARGIN_PM above; no draw, no memory.
 * - Weather: free, with its weather ready and no threat, it calls its weather when its element is at a disadvantage.
 */

const MOVE = Cmd.up | Cmd.down | Cmd.left | Cmd.right;
const ATTACK = Cmd.primary | Cmd.secondary;

/**
 * The movement bit that faces `self` towards `opp` so the Elemental Burst band (SUPER_BAND_PX across, from the caster's
 * centre to the wall on its facing side; horizontal unless the facing has no x part) overlaps `opp`; 0 when no 4-way
 * facing would.
 */
export function superFacing(self: FighterView, opp: FighterView): Command {
  const cx = self.x + self.w / 2;
  const cy = self.y + self.h / 2;
  const half = SUPER_BAND_PX / 2;
  if (opp.y < cy + half && opp.y + opp.h > cy - half) return opp.x + opp.w / 2 >= cx ? Cmd.right : Cmd.left;
  if (opp.x < cx + half && opp.x + opp.w > cx - half) return opp.y + opp.h / 2 >= cy ? Cmd.down : Cmd.up;
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

type Memory = [number, number, number, number, number, number, number];
const FRESH: Readonly<Memory> = [-1, 0, -1, 0, NO_PLAN, 0, -1];

export class ArcadeTactics {
  /**
   * Memory (`W.tick` based): [0] the tick the current opponent stun was first seen (-1: none) and [1] the reaction
   * drawn for it; [2] the tick the current threat was first seen (-1: none), [3] its reaction, [4] its plan (PARRY,
   * DODGE, GUARD or NO_PLAN) and [5] how many game ticks before the hit it acts; [6] the personality (-1 until the
   * first Arcade tick).
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
    return a === undefined ? base : avoidChord(a, this.decide(view, a, base, shot));
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
    const style = m[6] as Style;
    const line = shot === 0 || (base & ATTACK) !== 0 ? 0 : diagonalLine(self, opp);
    const axisShot = (base & ATTACK) !== 0 && (base & (Cmd.left | Cmd.right)) !== 0;
    let cmd = line !== 0 ? (base & ~MOVE) | line | shot : axisShot ? base & ~(Cmd.up | Cmd.down) : base;
    const free = a.selfStun === 0 && !a.superActive && (self.flags & EntityFlag.frozen) === 0;

    // Defence: the soonest hit among the enemy shots; one reaction delay and one plan per threat.
    let t = ARCADE_AI_LOOKAHEAD + 1;
    for (const p of a.shots) t = impactIn(self, p, t);
    const threat = t <= ARCADE_AI_LOOKAHEAD;
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
        m[5] = plan === PARRY ? 2 + draw(k[5]) : plan === DODGE ? ARCADE_AI_DODGE_AT : ARCADE_AI_GUARD_AT;
      }
      if (free && m[4] < NO_PLAN && view.tick - m[2] >= m[3] && t <= m[5]) {
        return m[4] === DODGE && a.dashIn === 0 ? Cmd.dash | toward(self, opp) : Cmd.guard;
      }
    }

    if (a.oppStun === 0) m[0] = -1;
    else {
      if (m[0] < 0) {
        m[0] = view.tick;
        m[1] = react();
      }
      const facing = superFacing(self, opp);
      if (free && this.level > 0 && a.meter >= SUPER_COST && facing !== 0 && view.tick - m[0] >= m[1]) {
        return (cmd & ~(MOVE | ATTACK)) | facing | Cmd.super;
      }
      cmd = a.combo > this.level * 2 ? cmd & ~ATTACK : pressStep(self, opp, cmd);
    }
    if (!free || threat) return cmd;
    const pm = Math.floor((self.hp * 1000) / self.maxHp);
    if (a.tagIn === 0 && pm < ARCADE_AI_TAG_BELOW_PM && a.partnerPm - pm > ARCADE_AI_TAG_MARGIN_PM) return cmd | Cmd.swap1;
    if (a.dashIn === 0 && style === RUSHDOWN && Math.abs(opp.x - self.x) + Math.abs(opp.y - self.y) > ARCADE_AI_FAR_PX && draw(1000) < k[6]) {
      return (cmd & ~MOVE) | Cmd.dash | toward(self, opp);
    }
    return a.weatherIn === 0 && this.unfavourable ? cmd | Cmd.weather : cmd;
  }

  save(): AgentState {
    return { mem: [...this.mem], rng: this.rng.save() };
  }

  /** Inverse of save(); null resets. Throws on a state that is not a record. */
  load(state: AgentState): void {
    const rec = stateRecord(state ?? { mem: FRESH, rng: null }, 'ArcadeTactics');
    this.mem = [...(rec['mem'] as Memory)];
    this.rng.load(rec['rng'] ?? null);
  }
}
