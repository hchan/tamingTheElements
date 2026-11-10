# ADR-0003: sfc32 streams, not mulberry32

Status: accepted

## Context

The sim needs seeded randomness with independent streams (opponent picks, combat rolls) so adding a draw in one place does not shift another.

## Decision

Use sfc32 with named, separately seeded streams. mulberry32 is rejected because of its single 32-bit state.

## Consequences

Larger state and better statistical quality, and stable per-stream sequences. Cost: a small hand-written PRNG module that needs its own tests.
