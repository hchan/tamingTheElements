import { SUPER_BAND_PX, SUPER_COST } from '../../data/arcade';
import { Cmd, type Command } from '../../sim/commands';
import { EntityFlag } from '../../sim/state';
import { stateNumber, stateRecord, type AgentState, type FighterView, type ObservationView } from '../agent';

/**
 * Arcade layer of the scripted AI (FUN-DESIGN 2.11, WP-arcade-ai-basic), at the Normal difficulty cap. It only edits
 * the command the Classic AI chose, and only when the view carries `arcade`, so Classic decisions are untouched.
 *
 * - Combo: the base AI already fires whenever a ready shot lines up, which keeps hitting a stunned (still) opponent.
 *   While the opponent is stunned the layer steps in along the line it shares with it (`pressStep`), so the next shot
 *   flies a shorter way and can land inside the stun; it holds the attack buttons once its own combo reaches
 *   ARCADE_AI_COMBO_CAP.
 * - Super: on a confirm (the opponent is stunned) with a full bar (SUPER_COST), after a reaction delay counted from the
 *   first tick it saw that stun, it faces the opponent and presses `Cmd.super`, if the Elemental Burst band would
 *   cover the opponent.
 * - 8-way aim (WP-arcade-8way-aim): a shot the base AI chose keeps its 4-way facing (a second movement axis is dropped,
 *   as Classic's x-wins facing would), and when no shot lines up on an axis but the opponent sits on a diagonal
 *   (`diagonalLine`), a ready projectile slot fires along that diagonal.
 */

/** Normal's combo length cap (FUN-DESIGN 2.11: Easy 1, Casual 2, Normal 3, Hard 5, WTF 8). */
export const ARCADE_AI_COMBO_CAP = 3;
/** Normal's reaction delay to a confirm, in `W.tick` ticks: ARCADE_AI_REACTION_MIN plus a draw below ARCADE_AI_REACTION_SPREAD (mean 14). */
export const ARCADE_AI_REACTION_MIN = 10;
export const ARCADE_AI_REACTION_SPREAD = 9;

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

export class ArcadeTactics {
  /** `W.tick` at which the current opponent stun was first seen (-1: none) and the reaction drawn for it. */
  private seenAt = -1;
  private delay = 0;

  /**
   * The Arcade version of `cmd` for `view`; `cmd` itself when the view has no `arcade` (Classic). `draw(n)` is the
   * agent's own uniform integer in [0, n), called once per confirm. `shot` is the attack bit of a projectile slot that
   * can fire now (0: none), used for a diagonal shot.
   */
  apply(view: ObservationView, base: Command, draw: (n: number) => number, shot: Command = 0): Command {
    const a = view.arcade;
    const self = view.self;
    const opp = view.opponent;
    if (a === undefined || self === undefined || opp === undefined) return base;
    const line = shot === 0 || (base & ATTACK) !== 0 ? 0 : diagonalLine(self, opp);
    const axisShot = (base & ATTACK) !== 0 && (base & (Cmd.left | Cmd.right)) !== 0;
    const cmd = line !== 0 ? (base & ~MOVE) | line | shot : axisShot ? base & ~(Cmd.up | Cmd.down) : base;
    if (a.oppStun === 0) {
      this.seenAt = -1;
      return cmd;
    }
    if (this.seenAt < 0) {
      this.seenAt = view.tick;
      this.delay = ARCADE_AI_REACTION_MIN + draw(ARCADE_AI_REACTION_SPREAD);
    }
    const free = a.selfStun === 0 && !a.superActive && (self.flags & EntityFlag.frozen) === 0;
    const facing = superFacing(self, opp);
    if (free && a.meter >= SUPER_COST && facing !== 0 && view.tick - this.seenAt >= this.delay) {
      return (cmd & ~(MOVE | ATTACK)) | facing | Cmd.super;
    }
    return a.combo >= ARCADE_AI_COMBO_CAP ? cmd & ~ATTACK : pressStep(self, opp, cmd);
  }

  save(): AgentState {
    return { seenAt: this.seenAt, delay: this.delay };
  }

  load(state: AgentState): void {
    if (state === null) {
      this.seenAt = -1;
      this.delay = 0;
      return;
    }
    const rec = stateRecord(state, 'ArcadeTactics');
    this.seenAt = stateNumber(rec, 'seenAt');
    this.delay = stateNumber(rec, 'delay');
  }
}
