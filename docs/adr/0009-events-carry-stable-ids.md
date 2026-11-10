# ADR-0009: Events carry stable ids

Status: accepted

## Context

Views need to play sounds and effects once per sim event, even across rewinds or snapshot restores.

## Decision

Each sim event has a stable id derived from tick and ordinal. Consumers dedupe by that id.

## Consequences

No double sounds or effects. Cost: events must be created in a deterministic order.
