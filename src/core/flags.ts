import { compareStrings } from './math/compare';

/** Sim-affecting feature flags. All default off; they must be recorded in the replay header. */
export interface SimFlags {
  readonly experimentalSpawnCurve: boolean;
  readonly experimentalPathing: boolean;
  /** Elemental Advantage abilities: data-only (no character owns them) until this is on. */
  readonly elementalAdvantage: boolean;
  /**
   * TESTER MODE only (see docs/TESTER-MODE.md): grants Capture from chapter 1. Never on in normal play; a match with it
   * on is a cheat match (replays refuse it, balance and golden tooling assert it is off).
   */
  readonly testerCapture: boolean;
  /**
   * The Arcade ruleset (docs/FUN-DESIGN.md): hit-stop, stun, combos, supers. Off means Classic, which must stay
   * bit-identical. The name sorts after every older Classic flag, so no existing Classic flag bit moves
   * (testerCapture sorts after it, but it is never on in a real match).
   */
  readonly rulesetArcade: boolean;
  /**
   * Classic only: the walkable arena ends at the action bar (y 640) instead of the legacy y 720, so a fighter cannot walk
   * behind the bar (KNOWN-BUGS). Off in tests/tools (bit-identical legacy arena); on in real play from the game app.
   * Sorts after every other flag, so no existing flag bit moves.
   */
  readonly walkAboveActionBar: boolean;
  /**
   * Classic only: a swapped-in hero enters where the outgoing one stands instead of at the team start (Arcade always does).
   * Off in tests/tools (bit-identical legacy); on in real play. Sorts last, so no existing flag bit moves.
   */
  readonly walkSwapInPlace: boolean;
}

export type SimFlagName = keyof SimFlags;

export const DEFAULT_SIM_FLAGS: SimFlags = {
  experimentalSpawnCurve: false,
  experimentalPathing: false,
  elementalAdvantage: false,
  testerCapture: false,
  rulesetArcade: false,
  walkAboveActionBar: false,
  walkSwapInPlace: false,
};

/** Flags that only tester mode may turn on. */
export const TESTER_FLAG_NAMES: readonly SimFlagName[] = ['testerCapture'];

/** True when any tester-only flag is on. */
export function hasTesterFlags(flags: SimFlags): boolean {
  return TESTER_FLAG_NAMES.some((n) => flags[n]);
}

/** Throws when a tester-only flag is on: balance, golden and regression tooling must never run cheat matches. */
export function assertNoTesterFlags(flags: SimFlags): void {
  if (hasTesterFlags(flags)) throw new Error('refusing a tester-mode (cheats) match');
}

/** Every sim flag name in sorted order: the replay header encoding and the world flag bits both follow it. */
export const FLAG_NAMES: readonly SimFlagName[] = Object.keys(DEFAULT_SIM_FLAGS).sort(compareStrings) as SimFlagName[];

/** World flag bits 0..15 are reserved for sim flags; internal world bits start at 16 (see sim/systems/end.ts). */
export const SIM_FLAG_BIT_LIMIT = 16;

/** Bit of a sim flag in world[World.flags]: `1 << index` in FLAG_NAMES. */
export function flagBit(name: SimFlagName): number {
  return 1 << FLAG_NAMES.indexOf(name);
}

/** The enabled sim flags as world flag bits (bit i = FLAG_NAMES[i]). */
export function flagBits(flags: SimFlags): number {
  let bits = 0;
  FLAG_NAMES.forEach((name, i) => {
    if (flags[name]) bits |= 1 << i;
  });
  return bits;
}

/** Inverse of flagBits: the sim flags set in world flag bits (internal bits 16+ are ignored). */
export function flagsFromBits(bits: number): SimFlags {
  const out: Record<SimFlagName, boolean> = { ...DEFAULT_SIM_FLAGS };
  FLAG_NAMES.forEach((name, i) => {
    out[name] = (bits & (1 << i)) !== 0;
  });
  return out;
}

/** Stable encoding: sorted names of enabled flags joined by ','; '' when none are on. */
export function encodeFlags(flags: SimFlags): string {
  return FLAG_NAMES.filter((n) => flags[n]).join(',');
}

/** Inverse of encodeFlags. Throws on unknown names so a replay never silently drops a flag. */
export function decodeFlags(encoded: string): SimFlags {
  const on = new Set<string>();
  for (const part of encoded.split(',')) {
    if (part === '') continue;
    if (!(FLAG_NAMES as readonly string[]).includes(part)) throw new Error(`unknown sim flag: ${part}`);
    on.add(part);
  }
  return {
    experimentalSpawnCurve: on.has('experimentalSpawnCurve'),
    experimentalPathing: on.has('experimentalPathing'),
    elementalAdvantage: on.has('elementalAdvantage'),
    testerCapture: on.has('testerCapture'),
    rulesetArcade: on.has('rulesetArcade'),
    walkAboveActionBar: on.has('walkAboveActionBar'),
    walkSwapInPlace: on.has('walkSwapInPlace'),
  };
}
