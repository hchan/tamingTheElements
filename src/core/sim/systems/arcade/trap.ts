import {
  TRAP_ARM_TICKS, TRAP_BLAST_PX, TRAP_BOX_PX, TRAP_COOLDOWN_TICKS, TRAP_FIRE_DAMAGE, TRAP_GUST_KB_Q4, TRAP_LIFE_TICKS,
  TRAP_MIN_GAP_PX, TRAP_PLACE_PX, TRAP_PUDDLE_LINGER_TICKS, TRAP_SPIKE_DAMAGE, TRAP_TEAM_MAX, TRAP_TRIGGER_PX, TrapKind, TrapReason,
  KNOCKBACK_Q4, HitStrength,
} from '../../../data/arcade';
import { DIR8_X, DIR8_Y, dir8FromSigns } from '../../../math/dir8';
import { inFight, isArcade, now } from '../../clock';
import type { Command } from '../../commands';
import { SimEventKind, type EventSink } from '../../events';
import {
  ARCADE_E, ARCADE_WORLD_BASE, ArcadeE, TEAM_COUNT, TRAP_STRIDE, TRAP_TABLE, TRAP_WORLD_MAX, TrapF, type SimState,
} from '../../state';
import type { SimWorld } from '../../world';
import { controlledId } from '../movement';
import { castDir } from './aim';
import { pending, Press, usePress } from './buffer';
import { applyArcadeHit, TRAP_BOMB_DEF, TRAP_SPIKE_DEF } from './hit';
import { setKnockback } from './knockback';
import { freeRoot } from './snag';
import { isFree, isInvulnerable } from './stun';
import { kindOf, patchOver, stageOf } from './terrain';

/**
 * Traps (WP 39, ideas/in-progress/wp39-bomb-trap.md). A trap is a TRAP_BOX_PX square in the world trap table
 * (`TRAP_TABLE`, TRAP_WORLD_MAX entries of `TrapF` fields; kind 0 = free, scanned in index order, never compacted).
 * It belongs to its team: it only ever affects the other team's controlled fighter, and only one that is not
 * invulnerable. Times are game ticks, so a freeze or a super pauses the fuse.
 */

const EARTH = 3;
const slotBase = (slot: number): number => ARCADE_WORLD_BASE + TRAP_TABLE + slot * TRAP_STRIDE;

/** The trap kind `id` plants: its element (1..4), else the stage element, else the Fire Bomb (void heroes). */
export function trapKindOf(s: SimState, id: number): number {
  const own = kindOf(s, id);
  if (own >= TrapKind.fireBomb && own <= TrapKind.gust) return own;
  const stage = stageOf(s);
  return stage >= TrapKind.fireBomb && stage <= TrapKind.gust ? stage : TrapKind.fireBomb;
}

/** Live traps of `team` (derived from the table, never stored). */
export function trapCount(s: SimState, team: number): number {
  let n = 0;
  for (let slot = 0; slot < TRAP_WORLD_MAX; slot++) {
    const b = slotBase(slot);
    if ((s.arcade[b + TrapF.kind] ?? 0) !== 0 && s.arcade[b + TrapF.team] === team) n++;
  }
  return n;
}

/** The first free table slot, or -1 when a trap closer than TRAP_MIN_GAP_PX (on both axes) blocks the spot or none is free. */
function freeSlot(s: SimState, x: number, y: number): number {
  let free = -1;
  for (let slot = 0; slot < TRAP_WORLD_MAX; slot++) {
    const b = slotBase(slot);
    if ((s.arcade[b + TrapF.kind] ?? 0) === 0) {
      if (free < 0) free = slot;
    } else if (Math.abs((s.arcade[b + TrapF.x] ?? 0) - x) < TRAP_MIN_GAP_PX && Math.abs((s.arcade[b + TrapF.y] ?? 0) - y) < TRAP_MIN_GAP_PX) {
      return -1;
    }
  }
  return free;
}

/**
 * `team`'s controlled fighter plants its trap on a pending trap press: TRAP_PLACE_PX ahead of its centre along its aim,
 * clamped to the arena. Refused (nothing spent, the press stays buffered) outside the fight, while not `isFree`
 * (stunned, dashing, charging, in a super, block-stun or weather recovery), on cooldown, at TRAP_TEAM_MAX live traps,
 * inside an earth rock, or within TRAP_MIN_GAP_PX of another trap. A rooted or guarding fighter may plant. Emits
 * `trapPlaced {slot, trap, x, y, team}` (trap: the TrapKind) and starts the cooldown (and the TRAP_CAST_TICKS walk lock, `inTrapRecovery`).
 */
export function castTrap(world: SimWorld, sink: EventSink, team: number): void {
  const s = world.state;
  const id = controlledId(world, team);
  const g = now(s);
  if (id < 0 || !pending(s, team, Press.trap) || !inFight(s) || !isFree(s, id)) return;
  if (g < (s.arcade[id * ARCADE_E + ArcadeE.trapReadyAt] ?? 0) || trapCount(s, team) >= TRAP_TEAM_MAX) return;
  const d = castDir(s, id);
  const ar = world.arena;
  const cx = (s.x[id] ?? 0) + (s.w[id] ?? 0) / 2 + (DIR8_X[d] ?? 0) * TRAP_PLACE_PX;
  const cy = (s.y[id] ?? 0) + (s.h[id] ?? 0) / 2 + (DIR8_Y[d] ?? 0) * TRAP_PLACE_PX;
  const x = Math.trunc(Math.min(Math.max(cx - TRAP_BOX_PX / 2, ar.x), ar.x + ar.w - TRAP_BOX_PX));
  const y = Math.trunc(Math.min(Math.max(cy - TRAP_BOX_PX / 2, ar.y), ar.y + ar.h - TRAP_BOX_PX));
  if (stageOf(s) === EARTH && patchOver(s, x, y, TRAP_BOX_PX, TRAP_BOX_PX) >= 0) return;
  const slot = freeSlot(s, x, y);
  if (slot < 0) return;
  const kind = trapKindOf(s, id);
  const b = slotBase(slot);
  const a = s.arcade;
  a[b + TrapF.kind] = kind;
  a[b + TrapF.x] = x;
  a[b + TrapF.y] = y;
  a[b + TrapF.team] = team;
  a[b + TrapF.armAt] = g + TRAP_ARM_TICKS;
  a[b + TrapF.endAt] = g + TRAP_ARM_TICKS + (TRAP_LIFE_TICKS[kind] ?? 0);
  a[b + TrapF.owner] = id;
  a[id * ARCADE_E + ArcadeE.trapReadyAt] = g + TRAP_COOLDOWN_TICKS;
  usePress(s, team, Press.trap);
  sink.emit(id, SimEventKind.trapPlaced, { slot, trap: kind, x, y, team });
}

/** True when `foe`'s box overlaps the square of side `size` centred on (`cx`, `cy`). */
function inSquare(s: SimState, foe: number, cx: number, cy: number, size: number): boolean {
  const x = s.x[foe] ?? 0;
  const y = s.y[foe] ?? 0;
  const h = size / 2;
  return x < cx + h && cx - h < x + (s.w[foe] ?? 0) && y < cy + h && cy - h < y + (s.h[foe] ?? 0);
}

/** The 8-way direction from (`cx`, `cy`) to `foe`'s centre: a diagonal unless one offset is 2x the other (as `dirToward`). */
function awayDir(s: SimState, foe: number, cx: number, cy: number, team: number): number {
  const dx = (s.x[foe] ?? 0) + (s.w[foe] ?? 0) / 2 - cx;
  const dy = (s.y[foe] ?? 0) + (s.h[foe] ?? 0) / 2 - cy;
  const d = dir8FromSigns(Math.abs(dx) * 2 <= Math.abs(dy) ? 0 : dx, Math.abs(dy) * 2 <= Math.abs(dx) ? 0 : dy);
  return d >= 0 ? d : team === 0 ? 0 : 4;
}

/** Frees `slot` with `trapTriggered {slot, trap, reason, x, y, team}` (sourceId: the owner). */
function endTrap(s: SimState, sink: EventSink, slot: number, reason: number): void {
  const b = slotBase(slot);
  const a = s.arcade;
  sink.emit(a[b + TrapF.owner] ?? 0, SimEventKind.trapTriggered, {
    slot, trap: a[b + TrapF.kind] ?? 0, reason, x: a[b + TrapF.x] ?? 0, y: a[b + TrapF.y] ?? 0, team: a[b + TrapF.team] ?? 0,
  });
  a.fill(0, b, b + TRAP_STRIDE);
}

/**
 * Fires trap `slot` (`reason` overlap or timeout, the same effect either way) on `foe` (-1: none vulnerable): the
 * Fire Bomb hits a foe in its TRAP_BLAST_PX square (a fire hit: it burns a Snag rope and douses enemy Puddles and
 * Gusts in the blast); the Spike hits a foe in its trigger box (medium hit, a longer stun, juggle +1, light
 * knockback); the Gust shoves one there TRAP_GUST_KB_Q4 away from the trap (no damage, never guarded).
 */
function fireTrap(world: SimWorld, sink: EventSink, slot: number, foe: number, reason: number): void {
  const s = world.state;
  const a = s.arcade;
  const b = slotBase(slot);
  const kind = a[b + TrapF.kind] ?? 0;
  const owner = a[b + TrapF.owner] ?? 0;
  const cx = (a[b + TrapF.x] ?? 0) + TRAP_BOX_PX / 2;
  const cy = (a[b + TrapF.y] ?? 0) + TRAP_BOX_PX / 2;
  const team = a[b + TrapF.team] ?? 0;
  endTrap(s, sink, slot, reason);
  const blast = TRAP_BLAST_PX;
  if (kind === TrapKind.fireBomb) douseTraps(s, sink, team, cx - blast / 2, cy - blast / 2, blast, blast);
  if (foe < 0 || !inSquare(s, foe, cx, cy, kind === TrapKind.fireBomb ? blast : TRAP_BOX_PX + 2 * TRAP_TRIGGER_PX)) return;
  const dir = awayDir(s, foe, cx, cy, team);
  if (kind === TrapKind.fireBomb) {
    applyArcadeHit(world, sink, owner, owner, foe, TRAP_FIRE_DAMAGE, TRAP_BOMB_DEF, dir);
    freeRoot(s, sink, owner, foe);
  } else if (kind === TrapKind.spike) {
    if (applyArcadeHit(world, sink, owner, owner, foe, TRAP_SPIKE_DAMAGE, TRAP_SPIKE_DEF, dir) > 0) {
      setKnockback(s, foe, KNOCKBACK_Q4[HitStrength.light], dir);
      a[foe * ARCADE_E + ArcadeE.juggle] = (a[foe * ARCADE_E + ArcadeE.juggle] ?? 0) + 1;
    }
  } else if (kind === TrapKind.gust) {
    a[foe * ARCADE_E + ArcadeE.wallBounced] = 0;
    setKnockback(s, foe, TRAP_GUST_KB_Q4, dir);
  }
}

/**
 * The per-tick trap pass, table order: `trapArmed` on the arming tick; then an armed trap whose trigger box (TRAP_BOX_PX
 * inflated by TRAP_TRIGGER_PX) holds the other team's controlled, vulnerable fighter fires on it (`overlap`), except
 * the Puddle, which slows it (its `trapSlowUntil` becomes now + TRAP_PUDDLE_LINGER_TICKS) and stays; a trap at its
 * `endAt` fires where it stands (`timeout`; a Puddle just dries up). Nothing fires outside the fight phase.
 */
export function stepTraps(world: SimWorld, sink: EventSink): void {
  const s = world.state;
  const a = s.arcade;
  const g = now(s);
  const fight = inFight(s);
  for (let slot = 0; slot < TRAP_WORLD_MAX; slot++) {
    const b = slotBase(slot);
    const kind = a[b + TrapF.kind] ?? 0;
    if (kind === 0) continue;
    const armAt = a[b + TrapF.armAt] ?? 0;
    if (g === armAt) sink.emit(a[b + TrapF.owner] ?? 0, SimEventKind.trapArmed, { slot, trap: kind });
    if (g < armAt || !fight) continue;
    const foe = controlledId(world, 1 - (a[b + TrapF.team] ?? 0));
    const cx = (a[b + TrapF.x] ?? 0) + TRAP_BOX_PX / 2;
    const cy = (a[b + TrapF.y] ?? 0) + TRAP_BOX_PX / 2;
    const reach = foe >= 0 && !isInvulnerable(s, foe) && inSquare(s, foe, cx, cy, TRAP_BOX_PX + 2 * TRAP_TRIGGER_PX);
    const timeout = g >= (a[b + TrapF.endAt] ?? 0);
    if (kind === TrapKind.puddle) {
      if (reach) a[foe * ARCADE_E + ArcadeE.trapSlowUntil] = g + TRAP_PUDDLE_LINGER_TICKS;
      if (timeout) endTrap(s, sink, slot, TrapReason.timeout);
    } else if (reach || timeout) {
      fireTrap(world, sink, slot, foe >= 0 && !isInvulnerable(s, foe) ? foe : -1, reach ? TrapReason.overlap : TrapReason.timeout);
    }
  }
}

/**
 * Fire from `team` over the box (`x`, `y`, `w`, `h`): a fire shot (SNAG_FIRE_ABILITIES) or a Fire Bomb blast douses
 * every other-team Puddle and Gust it overlaps (`trapTriggered` doused); a shot flies on. Bombs and Spikes ignore fire.
 */
export function douseTraps(s: SimState, sink: EventSink, team: number, x: number, y: number, w: number, h: number): void {
  const a = s.arcade;
  for (let slot = 0; slot < TRAP_WORLD_MAX; slot++) {
    const b = slotBase(slot);
    const kind = a[b + TrapF.kind] ?? 0;
    if ((kind !== TrapKind.puddle && kind !== TrapKind.gust) || a[b + TrapF.team] === team) continue;
    const tx = a[b + TrapF.x] ?? 0;
    const ty = a[b + TrapF.y] ?? 0;
    if (x < tx + TRAP_BOX_PX && tx < x + w && y < ty + TRAP_BOX_PX && ty < y + h) {
      endTrap(s, sink, slot, TrapReason.doused);
    }
  }
}

/** Empties the trap table with no effect and no event (round reset). */
export function clearTraps(s: SimState): void {
  const b = ARCADE_WORLD_BASE + TRAP_TABLE;
  s.arcade.fill(0, b, b + TRAP_WORLD_MAX * TRAP_STRIDE);
}

/** The `traps` slot (after `movement`): each team's trap press, team 0 first, then the trap pass. Returns at once in Classic. */
export function arcadeTrapSystem(world: SimWorld, _cmds: readonly [Command, Command], sink: EventSink): void {
  if (!isArcade(world.state)) return;
  for (let team = 0; team < TEAM_COUNT; team++) castTrap(world, sink, team);
  stepTraps(world, sink);
}
