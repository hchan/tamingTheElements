# ADR-0011: valibot for save validation (small, tree-shakable)

Status: accepted

## Context

Saves come from disk, old versions and user imports, so they must be validated before use.

## Decision

Use valibot schemas for save validation. zod is rejected for bundle size.

## Consequences

Small bundle impact and typed parse results. Cost: one more dependency.
