import { Cmd, hasCmd, type Command } from '../commands';
import { SimEventKind, type EventSink } from '../events';
import {
  EntityFlag,
  EntityKind,
  MAX_ENTITIES,
  TEAM_COUNT,
  TEAM_STRIDE,
  TeamField,
} from '../state';
import type { SimWorld } from '../world';
import { P1_START_X, P2_START_X, START_Y } from '../match';
import { inFight, isArcade, now } from '../clock';
import { TAG_COOLDOWN_TICKS } from '../../data/arcade';
import { startRestTimer } from './rest';
import { isFree } from './arcade/stun';
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
  if (arcade) {
    s.x[to] = s.x[from] ?? 0;
    s.y[to] = s.y[from] ?? 0;
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

/** Manual swap: swapN picks the N-th teammate (roster order, excluding the active one). */
export function swapSystem(
  world: SimWorld,
  cmds: readonly [Command, Command],
  sink: EventSink,
): void {
  const s = world.state;
  const tick = now(s);
  for (let team = 0; team < TEAM_COUNT; team++) {
    const cmd = cmds[team] ?? 0;
    const slot = SWAP_BITS.findIndex((bit) => hasCmd(cmd, bit));
    if (slot < 0) continue;
    if (!inFight(s)) continue; // Arcade only: no swaps outside the round's fight phase (always true in Classic)
    if (tick < (s.teams[team * TEAM_STRIDE + TeamField.swapCooldownUntil] ?? 0)) continue;
    const cur = activeOf(world, team);
    // Both sides need a living active character (a dead one is auto-swapped by the death system). A frozen one cannot
    // swap: legacy PlayerCharacter KeyDown ignores every key while `isFrozen` (the AI never swaps by hand). Arcade also
    // needs it free (`isFree`: not stunned, block-stunned, dashing, in a super or weather recovery; always true in Classic).
    if (cur < 0 || ((s.flags[cur] ?? 0) & EntityFlag.frozen) !== 0 || !isFree(s, cur)) continue;
    const from = cur;
    const target = teamMembers(world, team).filter((m) => m !== from)[slot];
    if (target === undefined || !isLiving(world, target)) continue;
    performSwap(world, sink, team, from, target);
  }
}
