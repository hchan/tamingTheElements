import type { SaveV1 } from '@core/menu-index';

/** What the player chose and saved. `undefined` means "follow the operating system". */
export interface SavedA11y {
  readonly reduceMotion?: boolean;
  readonly highContrast?: boolean;
}

/** OS-level preferences (`prefers-reduced-motion`, `prefers-contrast`). */
export interface OsA11y {
  readonly reduceMotion: boolean;
  readonly highContrast: boolean;
}

/** Effective preferences after resolving saved choices against the OS. */
export interface A11yPrefs {
  readonly reduceMotion: boolean;
  readonly highContrast: boolean;
}

/** Reads the optional save fields; anything that is not a boolean is ignored (migration-safe default). */
export function savedPrefs(save: Readonly<Record<string, unknown>> | null | undefined): SavedA11y {
  const out: { reduceMotion?: boolean; highContrast?: boolean } = {};
  if (save === null || save === undefined) return out;
  if (typeof save['reduceMotion'] === 'boolean') out.reduceMotion = save['reduceMotion'];
  if (typeof save['highContrast'] === 'boolean') out.highContrast = save['highContrast'];
  return out;
}

export function resolvePrefs(saved: SavedA11y, os: OsA11y): A11yPrefs {
  return {
    reduceMotion: saved.reduceMotion ?? os.reduceMotion,
    highContrast: saved.highContrast ?? os.highContrast,
  };
}

/**
 * Pure: a new save with the chosen prefs applied. A choice equal to the OS preference is stored as "absent"
 * so the game keeps following the OS; a differing choice is stored explicitly. Other fields are kept.
 */
export function applyPrefsToSave(save: SaveV1, chosen: A11yPrefs, os: OsA11y): SaveV1 {
  const rest: SaveV1 = { ...save };
  delete rest.reduceMotion;
  delete rest.highContrast;
  return {
    ...rest,
    ...(chosen.reduceMotion === os.reduceMotion ? {} : { reduceMotion: chosen.reduceMotion }),
    ...(chosen.highContrast === os.highContrast ? {} : { highContrast: chosen.highContrast }),
  };
}

type MatchMedia = (query: string) => { readonly matches: boolean };

export function readOsPrefs(
  matchMedia: MatchMedia | undefined = typeof window === 'undefined' ? undefined : window.matchMedia.bind(window),
): OsA11y {
  if (matchMedia === undefined) return { reduceMotion: false, highContrast: false };
  return {
    reduceMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    highContrast: matchMedia('(prefers-contrast: more)').matches,
  };
}

let saved: SavedA11y = {};

/** Installs the saved choices (call at start-up and after Settings saves). */
export function setSavedPrefs(next: SavedA11y): void {
  saved = next;
}

/** Current effective prefs; the OS is re-read on every call so a live OS change is honoured while unset. */
export function getPrefs(os: OsA11y = readOsPrefs()): A11yPrefs {
  return resolvePrefs(saved, os);
}

/** Reflects the prefs on `<html>` as data attributes that the stylesheet keys off. */
export function applyPrefsToDocument(prefs: A11yPrefs, root: HTMLElement = document.documentElement): void {
  root.dataset['reduceMotion'] = String(prefs.reduceMotion);
  root.dataset['highContrast'] = String(prefs.highContrast);
}
