# ADR-0018: Colocated unit tests; tests/ for cross-cutting suites

Status: accepted

## Context

Tests must be easy to find and to keep in step with the code they cover.

## Decision

Unit tests sit beside their module (`foo.ts`, `foo.test.ts`). Cross-cutting suites (repo checks, legacy characterization, golden replays, e2e) live under `tests/`.

## Consequences

Low friction for unit tests and a clear home for wide suites. Cost: two places to look.
