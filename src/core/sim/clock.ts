import { KO_SLOWMO_TICKS, RoundPhase } from '../data/arcade';
import { flagBit } from '../flags';
import { ARCADE_WORLD_BASE, ArcadeW, World as W, type SimState } from './state';

const ARCADE_BIT = flagBit('rulesetArcade');
const GAME_TICK = ARCADE_WORLD_BASE + ArcadeW.gameTick;
const FREEZE_UNTIL = ARCADE_WORLD_BASE + ArcadeW.freezeUntil;
const PHASE = ARCADE_WORLD_BASE + ArcadeW.phase;
const SLOW_MO_UNTIL = ARCADE_WORLD_BASE + ArcadeW.slowMoUntil;

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

/**
 * KO slow motion (FUN-DESIGN 2.10): during the KO_SLOWMO_TICKS ticks before `slowMoUntil` the game clock advances every
 * second tick; this is true on the ticks it holds (the odd ones counted from the window's start). Never true in Classic.
 */
export function isSlowMoHold(s: SimState): boolean {
  if (!isArcade(s)) return false;
  const left = (s.arcade[SLOW_MO_UNTIL] ?? 0) - (s.world[W.tick] ?? 0);
  return left > 0 && left <= KO_SLOWMO_TICKS && (left & 1) === 1;
}

/** True when this tick runs only the `input` slot and the game clock stands still: a freeze or a slow-motion hold. */
export function clockHeld(s: SimState): boolean {
  return isFrozen(s) || isSlowMoHold(s);
}

/** The Arcade round phase (a RoundPhase); Classic is always `fight`. */
export function roundPhase(s: SimState): number {
  return isArcade(s) ? (s.arcade[PHASE] ?? 0) : RoundPhase.fight;
}

/** True while characters may act and be hit: always in Classic, only in the `fight` phase in Arcade. */
export function inFight(s: SimState): boolean {
  return roundPhase(s) === RoundPhase.fight;
}

/** Advances the Arcade game clock after a tick whose systems ran. No-op in Classic. */
export function advanceGameClock(s: SimState): void {
  if (isArcade(s)) s.arcade[GAME_TICK] = (s.arcade[GAME_TICK] ?? 0) + 1;
}
