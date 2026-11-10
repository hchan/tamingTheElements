/** Garrison roster rules: sort comparators and capture (legacy Garrison.* parity). */
import { CHARACTERS } from '../data/characters';
import { ELEMENTS } from '../data/elements';
import type { Element } from '../data/elements';
import type { Sfc32 } from '../rng/sfc32';

export const MAX_SIZE = 10;

export interface GarrisonEntry {
  readonly id: string;
  readonly experience: number;
  readonly characterName: string;
  readonly createdTime: number;
  readonly lastModifiedTime: number;
}

export interface GarrisonSave {
  readonly garrison: readonly GarrisonEntry[];
  readonly garrisonSortOrder?: number;
}

/** Supplies fresh unique ids; core uses rng.meta, the platform may supply crypto. */
export interface IdSource {
  next(): string;
}

/** Wall-clock source injected by the platform (core never reads Date). */
export interface Clock {
  now(): number;
}

const HEX = '0123456789abcdef';

/** RFC 4122 v4 shaped uuid drawn from the meta stream. */
export function metaIdSource(meta: Sfc32): IdSource {
  return {
    next(): string {
      let out = '';
      for (let i = 0; i < 36; i++) {
        if (i === 8 || i === 13 || i === 18 || i === 23) out += '-';
        else if (i === 14) out += '4';
        else if (i === 19) out += HEX.charAt(8 + meta.int(4));
        else out += HEX.charAt(meta.int(16));
      }
      return out;
    },
  };
}

function elementOf(name: string): Element {
  const slug = name.toLowerCase().replace(/ /g, '-');
  return CHARACTERS.find((c) => c.id === slug)?.element ?? 'void';
}

function cmpNum(a: number, b: number): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function cmpStr(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

type Cmp = (a: GarrisonEntry, b: GarrisonEntry) => number;

const byExperience: Cmp = (a, b) => cmpNum(b.experience, a.experience);
const byName: Cmp = (a, b) => cmpStr(a.characterName, b.characterName);
const byElement: Cmp = (a, b) =>
  cmpNum(ELEMENTS.indexOf(elementOf(a.characterName)), ELEMENTS.indexOf(elementOf(b.characterName)));

function chain(...cmps: Cmp[]): Cmp {
  return (a, b) => {
    for (const c of cmps) {
      const r = c(a, b);
      if (r !== 0) return r;
    }
    return cmpStr(a.id, b.id);
  };
}

/** Sort orders 1..3 as in GARRISON_SORT_ORDER; experience is descending, others ascending; id breaks ties. */
export const GARRISON_COMPARATORS: Readonly<Record<1 | 2 | 3, Cmp>> = {
  1: chain(byExperience, byName, byElement),
  2: chain(byName, byExperience, byElement),
  3: chain(byElement, byExperience, byName),
};

/** Returns a sorted copy; unknown orders fall back to order 1. */
export function sortGarrison(garrison: readonly GarrisonEntry[], order: number): GarrisonEntry[] {
  const cmp = order === 2 ? GARRISON_COMPARATORS[2] : order === 3 ? GARRISON_COMPARATORS[3] : GARRISON_COMPARATORS[1];
  return [...garrison].sort(cmp);
}

/**
 * Appends a captured character. Legacy parity: MAX_SIZE is NOT enforced (KNOWN-BUG garrison-max-size-unenforced).
 * Returns a new save; the input is not mutated.
 */
export function addCaptured<S extends GarrisonSave>(
  save: S,
  characterName: string,
  clock: Clock,
  ids: IdSource,
): S {
  const t = clock.now();
  const entry: GarrisonEntry = {
    id: ids.next(),
    experience: 0,
    characterName,
    createdTime: t,
    lastModifiedTime: t,
  };
  return { ...save, garrison: [...save.garrison, entry] };
}
