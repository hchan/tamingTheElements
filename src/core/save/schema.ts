import * as v from 'valibot';
import type { SaveV1 } from './v1';

const finite = v.pipe(v.number(), v.finite());
const time = v.optional(finite);

const MemberSchema = v.looseObject({
  id: v.string(),
  experience: finite,
  characterName: v.string(),
  createdTime: time,
  lastModifiedTime: time,
});

export const SaveV1Schema = v.looseObject({
  schemaVersion: v.literal(1),
  savedAt: finite,
  chapter: v.pipe(v.number(), v.integer(), v.minValue(0)),
  garrisonSortOrder: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(3)),
  difficulty: finite,
  displaySettings: finite,
  garrison: v.array(MemberSchema),
  createdTime: time,
  lastModifiedTime: time,
  completeTime: time,
});

export type ValidateResult = { ok: true; value: SaveV1 } | { ok: false; issues: string[] };

export function validateV1(raw: unknown): ValidateResult {
  const r = v.safeParse(SaveV1Schema, raw);
  if (r.success) return { ok: true, value: r.output };
  return { ok: false, issues: r.issues.map((i) => i.message) };
}
