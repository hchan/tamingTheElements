import { parseRun, serializeRun, type TourRun } from './tour-model';

/** World Tour (FUN-DESIGN 2.18) keeps its run in its own key: never the Classic save, the settings or the Tester state. */
export const TOUR_KEY = 'tte.tour.v1';

/** The slice of Storage the Tour needs; structural, so a fake works in Node and `localStorage` fits. */
export interface TourStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Browser localStorage, or undefined when unavailable (private mode, blocked). Touches the global only when called. */
export function browserTourStorage(): TourStorage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

/** The saved run, or undefined when there is none, it is corrupt, or storage is missing or throws. */
export function loadRun(storage: TourStorage | undefined): TourRun | undefined {
  try {
    return parseRun(storage?.getItem(TOUR_KEY));
  } catch {
    return undefined;
  }
}

/** Saves the run; false when storage is missing or refuses (quota, private mode). */
export function saveRun(storage: TourStorage | undefined, run: TourRun): boolean {
  try {
    if (storage === undefined) return false;
    storage.setItem(TOUR_KEY, serializeRun(run));
    return true;
  } catch {
    return false;
  }
}

/** Forgets the saved run; false when storage is missing or refuses. */
export function clearRun(storage: TourStorage | undefined): boolean {
  try {
    if (storage === undefined) return false;
    storage.removeItem(TOUR_KEY);
    return true;
  } catch {
    return false;
  }
}
