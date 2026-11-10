import type { Agent, MatchSetup } from '@core/index';

/** What Arena reports when the sim emits MatchEnded; the app flow turns it into a save update. */
export interface MatchEnd {
  /** 0 = player team, 1 = enemy team, -1 = nobody. */
  readonly winner: number;
  /** Roster index (within team 0) of the active character at the end. */
  readonly activeSlot: number;
  /** Roster indices (within team 1) of captured opponents. */
  readonly capturedIndices: readonly number[];
}

/** Data handed to the Arena scene (Phaser-free so the app flow can build it without loading Phaser). */
export interface ArenaLaunch {
  readonly setup: MatchSetup;
  /** Agent for the enemy side; the player side is always the keyboard. */
  readonly enemy: Agent;
  readonly onEnd: (end: MatchEnd) => void;
}
