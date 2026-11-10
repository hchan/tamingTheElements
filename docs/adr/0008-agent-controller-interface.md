# ADR-0008: Agent/Controller interface

Status: accepted

## Context

Legacy mixes keyboard input and AI inside the character entity, so bots and humans take different code paths.

## Decision

Every combatant is driven by an Agent that emits commands per tick: keyboard, scripted AI, random bot or replay all share one contract.

## Consequences

Bots, replays and tests use the same path as a human. Cost: an up-front contract that must stay stable.
