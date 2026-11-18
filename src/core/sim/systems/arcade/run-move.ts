import { DASH_RECOVERY_TICKS, RUN_CONTACT_GAP_PX, RUN_COOLDOWN_TICKS, RUN_EDGE_PX, RunEnd } from '../../../data/arcade';
import { dir8FromSigns } from '../../../math/dir8';
import { inFight, isArcade, now } from '../../clock';
import { SimEventKind, type EventSink } from '../../events';
import { ARCADE_E, ARCADE_T, ARCADE_TEAM_BASE, ArcadeE, ArcadeT, EntityFlag, type SimState } from '../../state';
import type { SimWorld } from '../../world';
import { ccHeld } from './cc-state';
import { RANGED } from './meter';
import { isRooted } from './snag';
import { inSuper, isStunned } from './stun';

/**
 * Run Away / Run Towards (FUN-DESIGN 2.29), the leaf half: reads and ends a run, and picks its direction. It never imports
 * `../movement` (movement imports this). A ranged hero (`RANGED`, the boss and the dummy included) runs away, a melee hero towards.
 */

/** True while `id` is in a run (`runUntil` is the game tick it ends, 0 = none). Never true in Classic. */
export function isRunning(s: SimState, id: number): boolean {
  return isArcade(s) && (s.arcade[id * ARCADE_E + ArcadeE.runUntil] ?? 0) !== 0;
}

/** True when `id`'s run is a Run Away (a ranged hero), false for a Run Towards. */
export function runsAway(s: SimState, id: number): boolean {
  return RANGED[s.defId[id] ?? 0] === 1;
}

/**
 * Ends `id`'s run now (idempotent: nothing happens when it is not running): its cooldown counts from now, and
 * `runEnded {reason}` (a RunEnd) is emitted.
 */
export function endRun(s: SimState, sink: EventSink, id: number, reason: number): void {
  if (!isRunning(s, id)) return;
  const e = id * ARCADE_E;
  s.arcade[e + ArcadeE.runUntil] = 0;
  s.arcade[e + ArcadeE.runReadyAt] = now(s) + RUN_COOLDOWN_TICKS;
  sink.emit(id, SimEventKind.runEnded, { reason });
}

/** The run's end rows that stop it for good (as opposed to the soft pauses): see FUN-DESIGN 2.29. */
function interrupted(s: SimState, id: number): boolean {
  const e = id * ARCADE_E;
  const g = now(s);
  const dash = s.arcade[e + ArcadeE.dashUntil] ?? 0;
  return !inFight(s) || ((s.flags[id] ?? 0) & (EntityFlag.alive | EntityFlag.dead)) !== EntityFlag.alive ||
    isStunned(s, id) || ccHeld(s, id) || inSuper(s, id) || (dash > 0 && g < dash + DASH_RECOVERY_TICKS) ||
    (s.arcade[e + ArcadeE.chargeUntil] ?? 0) > g || isRooted(s, id);
}

/**
 * The per-tick end check of `id`'s run, called by movement before it steps: an interrupt (stun, daze, own super, dash,
 * charge, root, a phase that is not the fight, a KO) ends it as `interrupted`; a direction press since the start
 * (`ArcadeT.dirRise`) as `broken`; the end tick as `expired`.
 */
export function runTick(s: SimState, sink: EventSink, id: number): void {
  if (!isRunning(s, id)) return;
  if (interrupted(s, id)) endRun(s, sink, id, RunEnd.interrupted);
  else if ((s.arcade[ARCADE_TEAM_BASE + (s.team[id] ?? 0) * ARCADE_T + ArcadeT.dirRise] ?? 0) !== 0) endRun(s, sink, id, RunEnd.broken);
  else if (now(s) >= (s.arcade[id * ARCADE_E + ArcadeE.runUntil] ?? 0)) endRun(s, sink, id, RunEnd.expired);
}

/** Room (px) from `id` to the arena edge along x (`sign` -1 left, 1 right) or y (up -1, down 1). */
function room(world: SimWorld, id: number, horizontal: boolean, sign: number): number {
  const s = world.state;
  const a = world.arena;
  if (horizontal) return sign < 0 ? (s.x[id] ?? 0) - a.x : a.x + a.w - (s.x[id] ?? 0) - (s.w[id] ?? 0);
  return sign < 0 ? (s.y[id] ?? 0) - a.y : a.y + a.h - (s.y[id] ?? 0) - (s.h[id] ?? 0);
}

const sgn = (v: number): number => (v > 0 ? 1 : v < 0 ? -1 : 0);

/** Perpendicular escape of a cornered Away run: the axis direction not towards the foe with the most room (ties: up, down, left, right). */
function perpendicular(world: SimWorld, id: number, dx: number, dy: number): number {
  const cand = [[false, -1, 2], [false, 1, 6], [true, -1, 4], [true, 1, 0]] as const;
  let best = -1;
  let bestRoom = RUN_EDGE_PX - 1;
  for (const [horizontal, sign, dir] of cand) {
    if (sgn(horizontal ? dx : dy) === sign) continue; // towards the foe
    const r = room(world, id, horizontal, sign);
    if (r > bestRoom) {
      best = dir;
      bestRoom = r;
    }
  }
  return best;
}

/**
 * The dir8 `id` runs along this tick, or -1 to stand. The signs follow `dirToward` (a diagonal unless one axis offset is
 * twice the other). Towards: an axis whose gap to `foe` is at most RUN_CONTACT_GAP_PX is zeroed, so the hero holds at contact.
 * Away: the signs are negated; an axis with under RUN_EDGE_PX of room is zeroed (a wall slide), and when both are, a
 * perpendicular escape is tried, else -1 (cornered). Exactly coincident centres go to the x side with more room (team 0 left, team 1 right on a tie).
 */
export function runDirection(world: SimWorld, id: number, foe: number): number {
  const s = world.state;
  const w1 = s.w[id] ?? 0;
  const w2 = s.w[foe] ?? 0;
  const h1 = s.h[id] ?? 0;
  const h2 = s.h[foe] ?? 0;
  const dx = (s.x[foe] ?? 0) + w2 / 2 - (s.x[id] ?? 0) - w1 / 2;
  const dy = (s.y[foe] ?? 0) + h2 / 2 - (s.y[id] ?? 0) - h1 / 2;
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  let sx = ax * 2 <= ay ? 0 : sgn(dx); // dirToward's 2:1 rule
  let sy = ay * 2 <= ax ? 0 : sgn(dy);
  if (!runsAway(s, id)) {
    if (ax - (w1 + w2) / 2 <= RUN_CONTACT_GAP_PX) sx = 0;
    if (ay - (h1 + h2) / 2 <= RUN_CONTACT_GAP_PX) sy = 0;
    return dir8FromSigns(sx, sy);
  }
  sx = -sx;
  sy = -sy;
  if (ax === 0 && ay === 0) {
    const left = room(world, id, true, -1);
    const right = room(world, id, true, 1);
    sx = left === right ? ((s.team[id] ?? 0) === 0 ? -1 : 1) : left > right ? -1 : 1;
  }
  if (sx !== 0 && room(world, id, true, sx) < RUN_EDGE_PX) sx = 0;
  if (sy !== 0 && room(world, id, false, sy) < RUN_EDGE_PX) sy = 0;
  return sx === 0 && sy === 0 ? perpendicular(world, id, dx, dy) : dir8FromSigns(sx, sy);
}
