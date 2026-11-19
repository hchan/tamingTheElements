import { CHARACTER_HEIGHT, CHARACTER_WIDTH } from '../../data/chapters';
import { boxOfDef } from '../../data/size';
import { Cmd, hasCmd, type Command } from '../commands';
import { SimEventKind, type EventSink } from '../events';
import {
  EntityFlag,
  EntityKind,
  MAX_ENTITIES,
  TEAM_COUNT,
  TEAM_STRIDE,
  TeamField,
  World as W,
} from '../state';
import type { SimWorld } from '../world';
import { P1_START_X, P2_START_X, START_Y } from '../match';
import { inFight, isArcade, now } from '../clock';
import { flagBit } from '../../flags';
import { TAG_COOLDOWN_TICKS } from '../../data/arcade';
import { startRestTimer } from './rest';
import { isFree, isStunned } from './arcade/stun';
import { tagEntrance } from './arcade/tag';

/** Legacy `Game.swapCooldown` 5000 ms at 50 Hz. */
export const SWAP_COOLDOWN_TICKS = 250;

const SWAP_BITS = [Cmd.swap1, Cmd.swap2, Cmd.swap3, Cmd.swap4] as const;

/** Entity ids of a team's characters in roster (id) order. */
export function teamMembers(world: SimWorld, team: number): number[] {
  const s = world.state;
  const out: number[] = [];
  for (let id = 0; id < MAX_ENTITIES; id++) {
    if (
      ((s.flags[id] ?? 0) & EntityFlag.alive) !== 0 &&
      s.kind[id] === EntityKind.character &&
      s.team[id] === team
    )
      out.push(id);
  }
  return out;
}

function isLiving(world: SimWorld, id: number): boolean {
  return ((world.state.flags[id] ?? 0) & (EntityFlag.alive | EntityFlag.dead)) === EntityFlag.alive;
}

/** Legacy swapNextAliveTeammate order: first alive teammate (other than `id`) in roster order, or -1. */
export function nextAliveTeammate(world: SimWorld, team: number, id: number): number {
  for (const m of teamMembers(world, team)) if (m !== id && isLiving(world, m)) return m;
  return -1;
}

/**
 * Arcade tag targets (WP-arcade-3v3): the living teammates of `id` in roster order. Tag N (swapN) brings in entry N-1,
 * so Tag 1 brings the first living bench hero and, in 3v3, Tag 2 the other one; a downed hero is skipped (Classic keeps
 * a dead target as a no-op). A KO brings in entry 0 (`nextAliveTeammate`). With 2 heroes: the partner, or nothing.
 */
export function tagTargets(world: SimWorld, team: number, id: number): number[] {
  return teamMembers(world, team).filter((m) => m !== id && isLiving(world, m));
}

/**
 * Legacy benchHelper/unbenchHelper plus the swap cooldown stamp. Keeps hp; halves the rest-heal gap; starts the rest timer.
 * Arcade (FUN-DESIGN 2.6): `to` enters at `from`'s position (not the team start), the cooldown is TAG_COOLDOWN_TICKS,
 * and the tag entrance follows (`tagEntrance`: invulnerability, the free entrance attack, `tagIn`).
 */
export function performSwap(
  world: SimWorld,
  sink: EventSink,
  team: number,
  from: number,
  to: number,
): void {
  const s = world.state;
  const tick = now(s);
  const cur = s.hp[from] ?? 0;
  s.restCap[from] = cur + ((s.restCap[from] ?? 0) - cur) / 2;
  s.flags[from] = (s.flags[from] ?? 0) | EntityFlag.benched;
  startRestTimer(s, from, tick);
  s.flags[to] = (s.flags[to] ?? 0) & ~EntityFlag.benched;
  s.x[to] = team === 0 ? P1_START_X : P2_START_X;
  s.y[to] = START_Y;
  const arcade = isArcade(s);
  if (arcade || ((s.world[W.flags] ?? 0) & flagBit('walkSwapInPlace')) !== 0) {
    s.x[to] = s.x[from] ?? 0;
    s.y[to] = s.y[from] ?? 0;
    // A partner of another size enters on the outgoing hero's centre, kept inside the arena (giants, data/size.ts).
    const [wTo, hTo] = arcade ? boxOfDef(s.defId[to] ?? 0) : [CHARACTER_WIDTH, CHARACTER_HEIGHT];
    const [wFrom, hFrom] = arcade ? boxOfDef(s.defId[from] ?? 0) : [CHARACTER_WIDTH, CHARACTER_HEIGHT];
    if (wTo !== wFrom || hTo !== hFrom) {
      const a = world.arena;
      const nx = (s.x[from] ?? 0) + (wFrom - wTo) / 2;
      const ny = (s.y[from] ?? 0) + (hFrom - hTo) / 2;
      s.x[to] = Math.min(Math.max(nx, a.x), a.x + a.w - wTo);
      s.y[to] = Math.min(Math.max(ny, a.y), a.y + a.h - hTo);
    }
  }
  s.px[to] = s.x[to] ?? 0;
  s.py[to] = s.y[to] ?? 0;
  const base = team * TEAM_STRIDE;
  s.teams[base + TeamField.activeSlot] = teamMembers(world, team).indexOf(to);
  s.teams[base + TeamField.swapCooldownUntil] = tick + (arcade ? TAG_COOLDOWN_TICKS : SWAP_COOLDOWN_TICKS);
  sink.emit(to, SimEventKind.swapped, { from, to, team });
  tagEntrance(world, sink, team, from, to);
}

/** The team's active character: in the roster, not dead, not benched; -1 once the team is wiped. */
function activeOf(world: SimWorld, team: number): number {
  const s = world.state;
  for (const id of teamMembers(world, team)) {
    const f = s.flags[id] ?? 0;
    if ((f & (EntityFlag.dead | EntityFlag.benched)) === 0) return id;
  }
  return -1;
}

/**
 * Why a swap is refused, as bits (0 = allowed): several can hold at once, so the HUD picks its word by its own priority
 * while the sim only asks for non-zero. `swapAllowed` is the one place the rules live.
 */
export const SwapBlock = {
  /** Outside the round's fight phase (Arcade; never in Classic). */
  wait: 1,
  /** The team's swap cooldown has not run out. */
  cooldown: 2,
  /** The team has no living active hero. */
  noActive: 4,
  /** The active hero is frozen (Classic status). */
  frozen: 8,
  /** The active hero is hit-stunned (Arcade). */
  stun: 16,
  /** The active hero is not free for another reason: block-stun, dash recovery, a charge, a Snag root, a super, weather recovery. */
  busy: 32,
  /** `slot` names no living partner (only checked when `slot` >= 0). */
  noTarget: 64,
} as const;

/**
 * The swap rules for `team` this tick as `SwapBlock` bits, 0 when a press of swap slot `slot` (0..3; -1 = any, skips the
 * partner check) would tag. `swapSystem` applies exactly this, and the render view hands the same bits to the HUD.
 * Pure read of the state; integer only.
 */
export function swapAllowed(world: SimWorld, team: number, slot = -1): number {
  const s = world.state;
  let bits = 0;
  const fighting = inFight(s);
  if (!fighting) bits |= SwapBlock.wait;
  if (now(s) < (s.teams[team * TEAM_STRIDE + TeamField.swapCooldownUntil] ?? 0)) bits |= SwapBlock.cooldown;
  const cur = activeOf(world, team);
  if (cur < 0) return bits | SwapBlock.noActive;
  if (((s.flags[cur] ?? 0) & EntityFlag.frozen) !== 0) bits |= SwapBlock.frozen;
  if (isStunned(s, cur)) bits |= SwapBlock.stun;
  else if (fighting && !isFree(s, cur)) bits |= SwapBlock.busy;
  if (slot >= 0) {
    const target = isArcade(s) ? tagTargets(world, team, cur)[slot] : teamMembers(world, team).filter((m) => m !== cur)[slot];
    if (target === undefined || !isLiving(world, target)) bits |= SwapBlock.noTarget;
  }
  return bits;
}

/** Manual swap: swapN picks the N-th teammate (roster order, excluding the active one; Arcade: `tagTargets`). */
export function swapSystem(
  world: SimWorld,
  cmds: readonly [Command, Command],
  sink: EventSink,
): void {
  const s = world.state;
  for (let team = 0; team < TEAM_COUNT; team++) {
    // Arcade reads bit 10 (swap4) as the elemental ability (Cmd.elemental) and bit 9 (swap3) as Cleanse (Cmd.cleanse); a 3-hero team has no third or fourth swap there.
    const cmd = (cmds[team] ?? 0) & (isArcade(s) ? ~(Cmd.elemental | Cmd.cleanse) : ~0);
    const slot = SWAP_BITS.findIndex((bit) => hasCmd(cmd, bit));
    if (slot < 0) continue;
    // Refused: outside the fight phase, on cooldown, no living active hero, frozen (legacy PlayerCharacter ignores every key
    // while `isFrozen`), not free (`isFree`), or no living partner in the slot. A dead target is a no-op (see `tagTargets`).
    if (swapAllowed(world, team, slot) !== 0) continue;
    const from = activeOf(world, team);
    const target = isArcade(s) ? tagTargets(world, team, from)[slot] : teamMembers(world, team).filter((m) => m !== from)[slot];
    if (target === undefined) continue;
    performSwap(world, sink, team, from, target);
  }
}
