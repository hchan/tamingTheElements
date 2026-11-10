/** Preset tables keyed by legacy display name; numeric values are the legacy ones. */
export const DIFFICULTY = {
  Easy: 0.25,
  Casual: 0.66,
  Normal: 0.85,
  Hard: 1.12,
  'WTF (Way Too Fun)': 1.5,
} as const;

export const DISPLAY_SCALE = {
  Smallest: 1,
  Smaller: 1.1,
  Medium: 1.25,
  Large: 1.4,
  Largest: 1.6,
} as const;

export const GARRISON_SORT_ORDER = {
  'Experience, Name, Elemental Type': 1,
  'Name, Experience, Elemental Type': 2,
  'Elemental Type, Experience, Name': 3,
} as const;

export const DEFAULT_DIFFICULTY = 0.66;
export const DEFAULT_DISPLAY_SCALE = 1.25;
export const DEFAULT_GARRISON_SORT_ORDER = 1;
