import { Cmd, type Command } from '../../sim/commands';
import { ARCADE_AI_ZONE_HOLD_PX } from './arcade-ai';

/**
 * Footsies (SIM_VERSION 107, Hard only; ideas: AI footsies). Pure helpers, no draw and no memory: the last word on the walk of a free
 * Hard hero after `zone`, before wall hold, run and hazard. Three rules, each one skipped for a dash, guard, super, charge, trap or run command:
 * 1. Jitter: a walk that reverses along the axis of last tick's walk is held to the old step until a reversal tick
 *    (`tick % FOOTSIE_HOLD_TICKS === 0`), so the hero commits to a step for a few ticks instead of dithering.
 * 2. Whiff punish: a foe in recovery (the `frozen` flag) that is not stunned and not in a combo, with the hero in reach, gets the
 *    primary press and a step in.
 * 3. Close in: a ranged hero with nothing to do farther out than FOOTSIE_RANGED_IN_PX walks at the foe (zoning parked it at up to 760 px).
 */
export const FOOTSIE_HOLD_TICKS = 8;
/** The jitter hold only applies beyond this centre distance (px): in a clinch the hero must be free to step out. */
export const FOOTSIE_JITTER_MIN_PX = 100;
/** Centre distance (px) inside which a melee hero punishes a foe's recovery. */
export const FOOTSIE_PUNISH_PX = 220;
/** A ranged hero with no move and no shot walks in beyond this centre distance (px); the zoning band starts at ARCADE_AI_ZONE_MIN_PX. */
export const FOOTSIE_RANGED_IN_PX = 620;

const MOVE = Cmd.up | Cmd.down | Cmd.left | Cmd.right;
const BUSY = Cmd.dash | Cmd.guard | Cmd.super | Cmd.charge | Cmd.trap | Cmd.run;
const ATTACK = Cmd.primary | Cmd.secondary;

interface Box { readonly x: number; readonly y: number; readonly w: number; readonly h: number }

function towardBit(self: Box, opp: Box): Command {
  const dx = opp.x + opp.w / 2 - (self.x + self.w / 2);
  const dy = opp.y + opp.h / 2 - (self.y + self.h / 2);
  return Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? Cmd.right : Cmd.left) : dy >= 0 ? Cmd.down : Cmd.up;
}

export interface FootsieCtx {
  readonly tick: number;
  readonly prevCmd: Command;
  readonly ranged: boolean;
  /** The foe is in recovery (frozen), not stunned, not rooted, and no combo runs either way. */
  readonly punishable: boolean;
}

/** `cmd` after the three footsie rules (see the file comment). The caller gates level, phase, stun, stale and partner. */
export function footsieStep(self: Box, opp: Box, cmd: Command, ctx: FootsieCtx): Command {
  if ((cmd & BUSY) !== 0) return cmd;
  const dist = Math.max(
    Math.abs(opp.x + opp.w / 2 - (self.x + self.w / 2)),
    Math.abs(opp.y + opp.h / 2 - (self.y + self.h / 2)),
  );
  const toward = towardBit(self, opp);
  let out = cmd;
  if (ctx.punishable && !ctx.ranged && dist <= FOOTSIE_PUNISH_PX) {
    out = (out & ~MOVE) | toward | Cmd.primary;
  } else if (ctx.ranged && (out & (MOVE | ATTACK)) === 0 && dist > FOOTSIE_RANGED_IN_PX && dist < ARCADE_AI_ZONE_HOLD_PX) {
    out |= toward;
  }
  // Jitter: keep the previous step on an axis when the new one flips it, except on a reversal tick.
  const now = out & MOVE;
  const was = ctx.prevCmd & MOVE;
  if (dist > FOOTSIE_JITTER_MIN_PX && ctx.tick % FOOTSIE_HOLD_TICKS !== 0 && now !== 0 && was !== 0 && !ctx.punishable) {
    const flipX = ((now & Cmd.left) !== 0 && (was & Cmd.right) !== 0) || ((now & Cmd.right) !== 0 && (was & Cmd.left) !== 0);
    const flipY = ((now & Cmd.up) !== 0 && (was & Cmd.down) !== 0) || ((now & Cmd.down) !== 0 && (was & Cmd.up) !== 0);
    if (flipX || flipY) out = (out & ~MOVE) | was;
  }
  return out;
}
