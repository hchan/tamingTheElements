# ADR-0009: Events carry stable ids

Status: accepted

## Context

Views need to play sounds and effects once per sim event, even across rewinds or snapshot restores.

## Decision

Each sim event has a stable id derived from tick and ordinal. Consumers dedupe by that id. With rollback (docs/NETCODE.md) the same id can come again with a different payload: that is a correction and replaces the earlier event; an id the corrected timeline no longer produces arrives in `retracted`.

## Consequences

No double sounds or effects. Cost: events must be created in a deterministic order.
