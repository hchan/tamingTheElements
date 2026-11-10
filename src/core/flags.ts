import { compareStrings } from './math/compare';

/** Sim-affecting feature flags. All default off; they must be recorded in the replay header. */
export interface SimFlags {
  readonly experimentalSpawnCurve: boolean;
  readonly experimentalPathing: boolean;
  /** Elemental Advantage abilities: data-only (no character owns them) until this is on. */
  readonly elementalAdvantage: boolean;
}

export type SimFlagName = keyof SimFlags;

export const DEFAULT_SIM_FLAGS: SimFlags = {
  experimentalSpawnCurve: false,
  experimentalPathing: false,
  elementalAdvantage: false,
};

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
  };
}
