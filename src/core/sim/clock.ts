import { flagBit } from '../flags';
import { ARCADE_WORLD_BASE, ArcadeW, World as W, type SimState } from './state';

const ARCADE_BIT = flagBit('rulesetArcade');
const GAME_TICK = ARCADE_WORLD_BASE + ArcadeW.gameTick;
const FREEZE_UNTIL = ARCADE_WORLD_BASE + ArcadeW.freezeUntil;

/** True when the match runs the Arcade ruleset. Reads the hashed world flag bit, never a module variable. */
export function isArcade(s: SimState): boolean {
  return ((s.world[W.flags] ?? 0) & ARCADE_BIT) !== 0;
}

/**
 * The game clock that systems read for cooldowns, status timers and the rest-heal modulo: `W.tick` in Classic, the
 * Arcade `gameTick` (which stops during hit-stop and super freezes) in Arcade. `W.tick` stays the replay and event
 * index and always advances, so event ids stay unique while frozen.
 */
export function now(s: SimState): number {
  return isArcade(s) ? (s.arcade[GAME_TICK] ?? 0) : (s.world[W.tick] ?? 0);
}

/**
 * Freeze gate: true while an Arcade freeze holds the game clock. `freezeUntil` is in `W.tick` units because
 * `gameTick` does not advance while frozen. Never true in Classic.
 */
export function isFrozen(s: SimState): boolean {
  return isArcade(s) && (s.world[W.tick] ?? 0) < (s.arcade[FREEZE_UNTIL] ?? 0);
}

/** Advances the Arcade game clock after a tick whose systems ran. No-op in Classic. */
export function advanceGameClock(s: SimState): void {
  if (isArcade(s)) s.arcade[GAME_TICK] = (s.arcade[GAME_TICK] ?? 0) + 1;
}
