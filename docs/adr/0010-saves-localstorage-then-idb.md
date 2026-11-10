# ADR-0010: Saves: same localStorage key, additive v1, then IndexedDB + export/import

Status: accepted

## Context

Existing players have a v0 save in localStorage, whose values can be strings after the settings screen writes them.

## Decision

Keep the legacy key and read v0 as-is, add v1 fields additively, later move to IndexedDB, and offer export/import.

## Consequences

Players keep their progress. Cost: migration code and normalising string-typed legacy values.
