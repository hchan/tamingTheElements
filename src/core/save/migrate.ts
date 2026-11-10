import { validateV1 } from './schema';
import { checkSave } from './validate';
import { migrateV0ToV1 } from './migrations/v0-to-v1';
import { isRecord } from './v0';
import { SAVE_SCHEMA_VERSION, newEmptyState, type SaveV1 } from './v1';

export type SaveError =
  | { kind: 'future-version'; version: number }
  | { kind: 'invalid'; issues: string[] };

export type MigrateResult = { ok: true; value: SaveV1 } | { ok: false; error: SaveError };

/** Semantic checks (known characters, ranges, sizes); the on-disk format is not changed. */
function checked(value: SaveV1): MigrateResult {
  const c = checkSave(value);
  return c.ok ? { ok: true, value } : { ok: false, error: { kind: 'invalid', issues: c.issues } };
}

/** Bring any stored save to the current schema. null/garbage gives an empty state; a newer version is rejected. */
export function migrate(raw: unknown): MigrateResult {
  if (!isRecord(raw)) return { ok: true, value: newEmptyState() };
  const version = raw.schemaVersion;
  if (version === undefined) return checked(migrateV0ToV1(raw));
  if (typeof version === 'number' && Number.isFinite(version) && version > SAVE_SCHEMA_VERSION) {
    return { ok: false, error: { kind: 'future-version', version } };
  }
  const r = validateV1(raw);
  return r.ok ? checked(r.value) : { ok: false, error: { kind: 'invalid', issues: r.issues } };
}
