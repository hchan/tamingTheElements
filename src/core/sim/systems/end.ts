import type { Command } from '../commands';
import { SimEventKind, type EventSink } from '../events';
import { EntityFlag, EntityKind, MAX_ENTITIES, TEAM_COUNT, World as W } from '../state';
import type { SimState } from '../state';
import type { SimWorld } from '../world';

/** Bit in world[World.flags] set once MatchEnded has been emitted (bits 0..15 belong to sim flags, see flagBits). */
export const WORLD_ENDED_BIT = 1 << 17;

/**
 * A captured character is killed in the same tick (hp 0, then the death system), so `dead` alone takes it out of play.
 * A faded target hit by Capture is flagged captured but keeps fighting (KNOWN-BUG:capture-ignores-fade).
 */
function inPlay(s: SimState, id: number): boolean {
  const f = s.flags[id] ?? 0;
  return (f & EntityFlag.alive) !== 0 && (f & EntityFlag.dead) === 0 && s.kind[id] === EntityKind.character;
}

/** Characters of `team` still able to fight (alive, not dead; benched counts). */
export function survivorsOf(s: SimState, team: number): number {
  let n = 0;
  for (let id = 0; id < MAX_ENTITIES; id++) if (s.team[id] === team && inPlay(s, id)) n++;
  return n;
}

/** Entity ids on `team` flagged captured, ascending. */
export function capturedIds(s: SimState, team: number): number[] {
  const out: number[] = [];
  for (let id = 0; id < MAX_ENTITIES; id++) {
    const f = s.flags[id] ?? 0;
    if (s.team[id] === team && s.kind[id] === EntityKind.character && (f & EntityFlag.alive) !== 0 && (f & EntityFlag.captured) !== 0)
      out.push(id);
  }
  return out;
}

/** Winning team, -1 when both sides are out, or null while the match continues. */
export function matchWinner(s: SimState): number | null {
  const alive: boolean[] = [];
  for (let t = 0; t < TEAM_COUNT; t++) alive.push(survivorsOf(s, t) > 0);
  if (alive[0] && alive[1]) return null;
  if (!alive[0] && !alive[1]) return -1;
  return alive[0] ? 0 : 1;
}

export function hasEnded(s: SimState): boolean {
  return ((s.world[W.flags] ?? 0) & WORLD_ENDED_BIT) !== 0;
}

/** Ends the match when a team has no members left; emits MatchEnded exactly once. */
export function endSystem(world: SimWorld, _cmds: readonly [Command, Command], sink: EventSink): void {
  const s = world.state;
  if (hasEnded(s)) return;
  const winner = matchWinner(s);
  if (winner === null) return;
  s.world[W.flags] = (s.world[W.flags] ?? 0) | WORLD_ENDED_BIT;
  sink.emit(0, SimEventKind.matchEnded, {
    winner,
    captured: winner === 0 ? capturedIds(s, 1).length : 0,
    survivors: winner < 0 ? 0 : survivorsOf(s, winner),
  });
}

/** Roster indices (order within the team) of captured characters; allocation order equals roster order. */
export function capturedRosterIndices(s: SimState, team: number): number[] {
  const out: number[] = [];
  let k = 0;
  for (let id = 0; id < MAX_ENTITIES; id++) {
    if (s.team[id] !== team || s.kind[id] !== EntityKind.character || ((s.flags[id] ?? 0) & EntityFlag.alive) === 0) continue;
    if (((s.flags[id] ?? 0) & EntityFlag.captured) !== 0) out.push(k);
    k++;
  }
  return out;
}
