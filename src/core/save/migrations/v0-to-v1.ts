import { DIFFICULTY, DISPLAY_SCALE, GARRISON_SORT_ORDER } from '../../data/settings';
import { isRecord, type SaveV0 } from '../v0';
import { newEmptyState, type GarrisonMemberV1, type SaveV1 } from '../v1';

/** Number() that only accepts numbers and non-blank numeric strings; anything else is NaN. */
function toNumber(x: unknown): number {
  if (typeof x === 'number') return x;
  if (typeof x === 'string' && x.trim() !== '') return Number(x);
  return NaN;
}

function whitelisted(x: unknown, allowed: readonly number[], fallback: number): number {
  const n = toNumber(x);
  return allowed.includes(n) ? n : fallback;
}

function finiteOr(x: unknown, fallback: number): number {
  const n = toNumber(x);
  return Number.isFinite(n) ? n : fallback;
}

function optionalTime(x: unknown): number | undefined {
  const n = toNumber(x);
  return Number.isFinite(n) ? n : undefined;
}

function timeField<K extends string>(key: K, x: unknown): { [P in K]?: number } {
  const t = optionalTime(x);
  return (t === undefined ? {} : { [key]: t }) as { [P in K]?: number };
}

function asString(x: unknown): string {
  if (typeof x === 'string') return x;
  return typeof x === 'number' || typeof x === 'boolean' ? String(x) : '';
}

function member(raw: unknown): GarrisonMemberV1 | undefined {
  if (!isRecord(raw)) return undefined;
  const out: GarrisonMemberV1 = {
    ...raw,
    id: asString(raw.id),
    experience: Math.max(0, finiteOr(raw.experience, 0)),
    characterName: asString(raw.characterName),
  };
  const { createdTime, lastModifiedTime, ...rest } = out;
  return {
    ...rest,
    ...timeField('createdTime', createdTime),
    ...timeField('lastModifiedTime', lastModifiedTime),
  };
}

/** Pure; never throws for any object input. Unknown fields are preserved. */
export function migrateV0ToV1(v0: SaveV0): SaveV1 {
  const empty = newEmptyState();
  const chapter = toNumber(v0.chapter);
  const out: SaveV1 = {
    ...v0,
    schemaVersion: 1,
    savedAt: 0,
    chapter: Number.isInteger(chapter) && chapter >= 0 ? chapter : empty.chapter,
    garrisonSortOrder: whitelisted(v0.garrisonSortOrder, Object.values(GARRISON_SORT_ORDER), empty.garrisonSortOrder),
    difficulty: whitelisted(v0.difficulty, Object.values(DIFFICULTY), empty.difficulty),
    displaySettings: whitelisted(v0.displaySettings, Object.values(DISPLAY_SCALE), empty.displaySettings),
    garrison: Array.isArray(v0.garrison)
      ? v0.garrison.map(member).filter((m): m is GarrisonMemberV1 => m !== undefined)
      : [],
  };
  const { createdTime, lastModifiedTime, completeTime, ...rest } = out;
  const times = {
    ...timeField('createdTime', createdTime),
    ...timeField('lastModifiedTime', lastModifiedTime),
    ...timeField('completeTime', completeTime),
  };
  return { ...rest, ...times, savedAt: times.lastModifiedTime ?? 0 };
}
