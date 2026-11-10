# Save format

Code: `src/core/save/`. Validation uses `valibot`.

## v0 (legacy)

Whatever the Crafty game stored: `chapter`, `garrisonSortOrder`, `difficulty`, `displaySettings`, `garrison[]`
(`id`, `experience`, `characterName`, `createdTime`, `lastModifiedTime`), `createdTime`, `lastModifiedTime`,
optional `completeTime` and `params`. Settings may be numeric strings. No version field.

## v1

A v0 superset: the same top-level fields with numbers normalised, plus `schemaVersion: 1` and `savedAt`.
Unknown fields are preserved so the legacy game can still read a v1 save.

- `Number()` normalisation with a whitelist fallback: `garrisonSortOrder`, `difficulty` and `displaySettings`
  must be one of the known preset values (`src/core/data/settings.ts`), else the default; `chapter` must be a
  non-negative integer, else 0.
- `savedAt` is copied from `lastModifiedTime` (0 if absent); core never reads a clock.

## `migrate(raw)`

Returns a result, never throws.

| Input | Result |
|---|---|
| null or non-object | ok, `newEmptyState()` (`chapter: 0`, `displaySettings: 1.25`) |
| no `schemaVersion` (v0) | ok, migrated to v1 |
| `schemaVersion: 1` | validated; `{kind: 'invalid'}` error on failure |
| `schemaVersion` > 1 | error `{kind: 'future-version', version}` |

`migrate` is idempotent.
