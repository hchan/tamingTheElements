/**
 * Tester-mode cheats on a running match (see docs/TESTER-MODE.md). Every function here is a plain state edit applied
 * OUTSIDE `step`: no system, rule or data table changes, so Classic play is untouched. A match that used any of these is a
 * cheat match; the platform flags its replay (`header.cheats`) and the verifiers refuse it. Pure and deterministic.
 */
import { CAPTURE_HEALTH_FRACTION } from '../data/chapters';
import { CHARACTERS } from '../data/characters';
import { CHARACTER_TEXT } from '../data/text-ids';
import { EntityFlag, EntityKind, MAX_ENTITIES, TeamField } from '../sim/state';
import { controlledId } from '../sim/systems/movement';
import type { SimWorld } from '../sim/world';

/** One-shot actions on the running match; Shift-Q / Shift-X / Shift-C are `win` / `freezeEnemy` / `captureWin`. */
export type ArenaCheat = 'myHp25' | 'enemyHp25' | 'win' | 'freezeEnemy' | 'captureWin';
export const ARENA_CHEATS: readonly ArenaCheat[] = ['myHp25', 'enemyHp25', 'win', 'freezeEnemy', 'captureWin'];

/** Per-tick options applied before every `step`. */
export interface TickCheats {
  readonly godMode: boolean;
  readonly instantSwap: boolean;
}

const OUT = EntityFlag.dead;

/** Ids of a team's characters still in play (alive, not dead), benched included; see `inPlay` in systems/end.ts. */
function inPlay(world: SimWorld, team: number): number[] {
  const s = world.state;
  const out: number[] = [];
  for (let id = 0; id < MAX_ENTITIES; id++) {
    const f = s.flags[id] ?? 0;
    if (s.kind[id] === EntityKind.character && s.team[id] === team && (f & EntityFlag.alive) !== 0 && (f & OUT) === 0) out.push(id);
  }
  return out;
}

/** Sets the team's active character to a fraction of its max health (0.25 is exactly the capture line). */
function setActiveHp(world: SimWorld, team: number, fraction: number): void {
  const id = controlledId(world, team);
  if (id < 0) return;
  const s = world.state;
  s.hp[id] = (s.maxHp[id] ?? 0) * fraction;
}

/** Applies a one-shot cheat. Enemy-wide cheats hit every living enemy so the match ends at once. */
export function applyArenaCheat(world: SimWorld, cheat: ArenaCheat): void {
  const s = world.state;
  switch (cheat) {
    case 'myHp25':
      setActiveHp(world, 0, CAPTURE_HEALTH_FRACTION);
      return;
    case 'enemyHp25':
      setActiveHp(world, 1, CAPTURE_HEALTH_FRACTION);
      return;
    case 'win':
      for (const id of inPlay(world, 1)) s.hp[id] = 0;
      return;
    case 'captureWin':
      for (const id of inPlay(world, 1)) {
        s.flags[id] = (s.flags[id] ?? 0) | EntityFlag.captured;
        s.hp[id] = 0;
      }
      return;
    case 'freezeEnemy':
      for (const id of inPlay(world, 1)) s.flags[id] = (s.flags[id] ?? 0) | EntityFlag.frozen;
      return;
  }
}

/** Call immediately before `step`: god mode keeps the player's team at full health, instant swap zeroes the swap cooldown. */
export function applyTickCheats(world: SimWorld, opts: TickCheats): void {
  const s = world.state;
  if (opts.godMode) {
    for (const id of inPlay(world, 0)) {
      s.hp[id] = s.maxHp[id] ?? 0;
      s.restCap[id] = s.maxHp[id] ?? 0;
    }
  }
  if (opts.instantSwap) s.teams[TeamField.swapCooldownUntil] = 0;
}

/** One bench-HUD row: current and maximum health plus the rest ceiling the character heals toward. */
export interface BenchRow {
  readonly id: number;
  readonly name: string;
  readonly active: boolean;
  readonly dead: boolean;
  readonly hp: number;
  readonly maxHp: number;
  readonly restCap: number;
}

/** A team's roster for the tester bench HUD (entity id order; the active one is marked, dead ones are kept and marked). */
export function benchRows(world: SimWorld, team: number): BenchRow[] {
  const s = world.state;
  const rows: BenchRow[] = [];
  for (let id = 0; id < MAX_ENTITIES; id++) {
    const f = s.flags[id] ?? 0;
    const capturedOut = (f & EntityFlag.captured) !== 0 && (f & EntityFlag.dead) !== 0;
    if (s.kind[id] !== EntityKind.character || s.team[id] !== team || (f & EntityFlag.alive) === 0 || capturedOut) continue;
    const def = CHARACTERS[s.defId[id] ?? 0];
    rows.push({
      id,
      name: (def && CHARACTER_TEXT.get(def.id)?.name) ?? def?.id ?? '?',
      active: (f & (EntityFlag.benched | EntityFlag.dead)) === 0,
      dead: (f & EntityFlag.dead) !== 0,
      hp: s.hp[id] ?? 0,
      maxHp: s.maxHp[id] ?? 0,
      restCap: s.restCap[id] ?? 0,
    });
  }
  return rows;
}
