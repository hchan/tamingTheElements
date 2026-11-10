/** Sim-affecting feature flags. All default off; they must be recorded in the replay header. */
export interface SimFlags {
  readonly experimentalSpawnCurve: boolean;
  readonly experimentalPathing: boolean;
}

export type SimFlagName = keyof SimFlags;

export const DEFAULT_SIM_FLAGS: SimFlags = {
  experimentalSpawnCurve: false,
  experimentalPathing: false,
};

const FLAG_NAMES = Object.keys(DEFAULT_SIM_FLAGS).sort() as SimFlagName[];

/** Stable encoding: sorted names of enabled flags joined by ','; '' when none are on. */
export function encodeFlags(flags: SimFlags): string {
  return FLAG_NAMES.filter((n) => flags[n]).join(',');
}

/** Inverse of encodeFlags. Throws on unknown names so a replay never silently drops a flag. */
export function decodeFlags(encoded: string): SimFlags {
  const on = new Set<string>();
  for (const part of encoded.split(',')) {
    if (part === '') continue;
    if (!(FLAG_NAMES as string[]).includes(part)) throw new Error(`unknown sim flag: ${part}`);
    on.add(part);
  }
  return {
    experimentalSpawnCurve: on.has('experimentalSpawnCurve'),
    experimentalPathing: on.has('experimentalPathing'),
  };
}
