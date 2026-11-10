import { msToTicks, TICK_MS } from '../../data/types';
import { Cmd, type Command } from '../../sim/commands';
import { stateNumber, stateRecord, type AgentState } from '../agent';
import type { AttackType } from './attack';

/**
 * Port of the legacy EnemyCharacter movement (baseCharacter.js): doMovement, doShooterMovement,
 * doMeleeMovement, moveTowardsTargetPlayer, moveAwayFromTargetPlayer with its edge/corner
 * unsticking. Legacy `Delay` milliseconds become tick counts (20 ms per tick).
 *
 * Deviations from legacy, all documented in movement.test.ts:
 * - The sim moves characters from a Command, so one call yields one step per axis. Legacy could take
 *   two steps in a call (away step, then the edge override); the override wins here.
 * - Legacy detects "blocked" inside the same call (position after its own move). An agent cannot see
 *   the sim's collision result until the next observation, so blocking is read from the previous
 *   tick's call (one tick = 20 ms late) and only when the last sent command moved on that axis.
 * - moveTowards' random "step off the target axis" draws from the agent's own stream via `aiInt`; legacy moved the
 *   position by up to two steps, here the command is a single step (sign of the legacy displacement).
 * - The sim undoes a step that leaves the arena (legacy `resetIfOutOfBounds`), but the agent only sees that a tick
 *   later. ScriptedAI therefore refuses steps that would leave the arena and reports them as walls (`noteSent`),
 *   which the next moveAway call treats exactly like a blocked move.
 * - The unstick state is agent-local, not part of the world snapshot: `save`/`load` carry it next to a world snapshot
 *   (`AgentSnapshot`); replays record commands.
 */

export const SAME_POSITION_CHECK_TICKS = msToTicks(2000);
export const EDGE_UNSTICK_TICKS = msToTicks(3000);
/** Same-position checks in a row that trigger a forced y escape. */
export const STUCK_LIMIT = 5;

export type MoveKind = 'towards' | 'away' | 'none';

export interface MovementContext {
  /** Type of the primary ability (legacy doMovement only handles Range and Melee). */
  readonly primary: AttackType;
  /** Character has the legacy MeleeCharacter component. */
  readonly selfMelee: boolean;
  readonly targetMelee: boolean;
  /** canFire / canMelee: not frozen, below maxActive and cooled down (the legacy two are identical). */
  readonly ready: boolean;
}

/** Legacy doMovement + doShooterMovement + doMeleeMovement decision. */
export function chooseMovement(c: MovementContext): MoveKind {
  if (c.primary === 'range') {
    if (!c.ready) return 'away';
    // Legacy retreats here when `targetMelee && !canMelee`, but canMelee equals canFire (true here).
    if (c.selfMelee) return 'towards';
    return c.targetMelee ? 'away' : 'towards';
  }
  if (c.primary === 'melee') return c.targetMelee && !c.ready ? 'away' : 'towards';
  return 'none';
}

export interface Point {
  readonly x: number;
  readonly y: number;
}
export interface Box extends Point {
  readonly w: number;
  readonly h: number;
}

type TimerKind = 'check' | 'clearX' | 'clearY';
interface Timer {
  readonly at: number;
  readonly ms: number;
  readonly kind: TimerKind;
}

function axisOf(cmd: Command, neg: number, pos: number): number {
  return ((cmd & pos) !== 0 ? 1 : 0) - ((cmd & neg) !== 0 ? 1 : 0);
}

function stepCmd(sx: number, sy: number): Command {
  let c = 0;
  if (sx < 0) c |= Cmd.left;
  else if (sx > 0) c |= Cmd.right;
  if (sy < 0) c |= Cmd.up;
  else if (sy > 0) c |= Cmd.down;
  return c;
}

/** Per-enemy movement state: the legacy moveAway*Direction flags, samePositionCount and its Delay timers. */
export class MovementState {
  moveAwayX: 'e' | 'w' | null = null;
  moveAwayY: 's' | 'n' | null = null;
  samePositionCount = 0;
  checkActive = false;

  private timers: Timer[] = [];
  private prevX: number | null = null;
  private prevY: number | null = null;
  private lastTick = -2;
  private sentX = 0;
  private sentY = 0;
  private wallX = false;
  private wallY = false;

  /** Every field as fresh plain data (timers as [at, ms, kind] triples). */
  save(): AgentState {
    return {
      moveAwayX: this.moveAwayX,
      moveAwayY: this.moveAwayY,
      samePositionCount: this.samePositionCount,
      checkActive: this.checkActive,
      timers: this.timers.map((t) => [t.at, t.ms, t.kind]),
      prevX: this.prevX,
      prevY: this.prevY,
      lastTick: this.lastTick,
      sentX: this.sentX,
      sentY: this.sentY,
      wallX: this.wallX,
      wallY: this.wallY,
    };
  }

  /** Exact inverse of save(). */
  load(state: AgentState): void {
    const rec = stateRecord(state, 'MovementState');
    const pick = <T extends AgentState>(key: string, ok: readonly T[]): T => {
      const v = rec[key] as T;
      if (!ok.includes(v)) throw new TypeError(`MovementState: bad ${key}`);
      return v;
    };
    const maybeNumber = (key: string): number | null => (rec[key] === null ? null : stateNumber(rec, key));
    const flag = (key: string): boolean => pick(key, [true, false]);
    this.moveAwayX = pick('moveAwayX', ['e', 'w', null]);
    this.moveAwayY = pick('moveAwayY', ['s', 'n', null]);
    this.samePositionCount = stateNumber(rec, 'samePositionCount');
    this.checkActive = flag('checkActive');
    const timers = rec['timers'];
    if (!Array.isArray(timers)) throw new TypeError('MovementState: bad timers');
    this.timers = (timers as readonly AgentState[]).map((t) => {
      const [at, ms, kind] = Array.isArray(t) ? (t as readonly AgentState[]) : [];
      if (typeof at !== 'number' || typeof ms !== 'number' || (kind !== 'check' && kind !== 'clearX' && kind !== 'clearY')) {
        throw new TypeError('MovementState: bad timer');
      }
      return { at, ms, kind };
    });
    this.prevX = maybeNumber('prevX');
    this.prevY = maybeNumber('prevY');
    this.lastTick = stateNumber(rec, 'lastTick');
    this.sentX = stateNumber(rec, 'sentX');
    this.sentY = stateNumber(rec, 'sentY');
    this.wallX = flag('wallX');
    this.wallY = flag('wallY');
  }

  /** Original Delay lengths (ms) of the pending timers, in creation order (fixture `delays`). */
  pendingDelaysMs(): number[] {
    return this.timers.map((t) => t.ms);
  }

  /** Records the final command sent this tick, so the next call can tell "blocked" from "did not try to move". */
  noteSent(cmd: Command, wallX = false, wallY = false): void {
    this.sentX = axisOf(cmd, Cmd.left, Cmd.right);
    this.sentY = axisOf(cmd, Cmd.up, Cmd.down);
    this.wallX = wallX;
    this.wallY = wallY;
  }

  /** Fires due Delay callbacks (call once per tick before deciding). */
  advance(tick: number, self: Point, target: Point): void {
    if (!this.timers.some((t) => t.at <= tick)) return;
    const due = this.timers.filter((t) => t.at <= tick);
    this.timers = this.timers.filter((t) => t.at > tick);
    for (const t of due) {
      if (t.kind === 'clearX') this.moveAwayX = null;
      else if (t.kind === 'clearY') this.moveAwayY = null;
      else this.fireSamePositionCheck(tick, self, target);
    }
  }

  private fireSamePositionCheck(tick: number, self: Point, target: Point): void {
    this.checkActive = false;
    if (this.prevX !== self.x || this.prevY !== self.y) return;
    this.samePositionCount++;
    if (this.samePositionCount >= STUCK_LIMIT) {
      this.samePositionCount = 0;
      this.moveAwayY = target.y - self.y > 0 ? 's' : 'n';
      this.schedule(tick, EDGE_UNSTICK_TICKS, 'clearY');
    }
  }

  private schedule(tick: number, ticks: number, kind: TimerKind): void {
    this.timers.push({ at: tick + ticks, ms: ticks * TICK_MS, kind });
  }

  private blocked(tick: number, self: Point): { x: boolean; y: boolean } {
    const fresh = this.lastTick === tick - 1 && this.prevX !== null && this.prevY !== null;
    return {
      x: fresh && (this.wallX || (this.sentX !== 0 && this.prevX === self.x)),
      y: fresh && (this.wallY || (this.sentY !== 0 && this.prevY === self.y)),
    };
  }

  private remember(tick: number, self: Point): void {
    this.prevX = self.x;
    this.prevY = self.y;
    this.lastTick = tick;
  }

  /** Legacy moveAwayFromTargetPlayer. Returns the movement bits for this tick. */
  moveAway(tick: number, self: Box, target: Box): Command {
    const blocked = this.blocked(tick, self);
    this.remember(tick, self);
    if (!this.checkActive) {
      this.checkActive = true;
      this.schedule(tick, SAME_POSITION_CHECK_TICKS, 'check');
    }
    // x-edge / y-edge: blocked against a wall while the target is close.
    if (blocked.x && Math.abs(target.x - self.x) < target.w * 3 && this.moveAwayX === null) {
      this.moveAwayX = target.x - self.x > 0 ? 'e' : 'w';
      this.schedule(tick, EDGE_UNSTICK_TICKS, 'clearX');
    }
    if (blocked.y && Math.abs(target.y - self.y) < target.h * 3 && this.moveAwayY === null) {
      this.moveAwayY = target.y - self.y > 0 ? 's' : 'n';
      this.schedule(tick, EDGE_UNSTICK_TICKS, 'clearY');
    }
    // An active override replaces the plain "away" step on its axis (legacy applied both steps).
    const sx = this.moveAwayX !== null ? (this.moveAwayX === 'e' ? 1 : -1) : target.x - self.x > 0 ? -1 : 1;
    const sy = this.moveAwayY !== null ? (this.moveAwayY === 's' ? 1 : -1) : target.y - self.y > 0 ? -1 : 1;
    return stepCmd(sx, sy);
  }

  /**
   * Legacy moveTowardsTargetPlayer. `speed` is the per-tick step, used only to detect "this step lands
   * exactly on the target axis", where legacy flips a coin (the agent's `AgentRng` here) to step off it.
   */
  moveTowards(tick: number, self: Point, target: Point, speed: number, aiInt: (n: number) => number): Command {
    this.remember(tick, self);
    return stepCmd(this.towardsAxis(self.x, target.x, speed, aiInt), this.towardsAxis(self.y, target.y, speed, aiInt));
  }

  private towardsAxis(own: number, goal: number, speed: number, aiInt: (n: number) => number): number {
    const base = goal - own > 0 ? 1 : -1;
    if (own + base * speed !== goal) return base;
    const final = base * speed + (aiInt(2) === 1 ? speed : -speed);
    return Math.sign(final);
  }
}
