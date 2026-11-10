import {
  DEFAULT_DIFFICULTY,
  DEFAULT_DISPLAY_SCALE,
  DEFAULT_GARRISON_SORT_ORDER,
} from '../data/settings';

export const SAVE_SCHEMA_VERSION = 1;

export interface GarrisonMemberV1 {
  id: string;
  experience: number;
  characterName: string;
  createdTime?: number;
  lastModifiedTime?: number;
  [extra: string]: unknown;
}

/** v1 is a v0 superset: same top-level fields, normalised, plus `schemaVersion` and `savedAt`. Unknown fields are kept. */
export interface SaveV1 {
  schemaVersion: 1;
  /** Epoch ms of the last write; taken from v0 `lastModifiedTime` on migration (core never reads a clock). */
  savedAt: number;
  chapter: number;
  garrisonSortOrder: number;
  difficulty: number;
  displaySettings: number;
  garrison: GarrisonMemberV1[];
  createdTime?: number;
  lastModifiedTime?: number;
  completeTime?: number;
  /** Accessibility: absent means "follow the OS `prefers-reduced-motion`". Non-boolean values are ignored. */
  reduceMotion?: boolean;
  /** Accessibility: absent means "follow the OS `prefers-contrast`". Non-boolean values are ignored. */
  highContrast?: boolean;
  /** Remapped keys (`KeyboardEvent.code` lists per action); absent means the default bindings. Sanitised on read. */
  keyBindings?: Record<string, string[]>;
  [extra: string]: unknown;
}

export function newEmptyState(): SaveV1 {
  return {
    schemaVersion: 1,
    savedAt: 0,
    chapter: 0,
    garrisonSortOrder: DEFAULT_GARRISON_SORT_ORDER,
    difficulty: DEFAULT_DIFFICULTY,
    displaySettings: DEFAULT_DISPLAY_SCALE,
    garrison: [],
  };
}
