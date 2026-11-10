# ADR-0002: Deterministic 50 Hz plain-TS sim; Phaser is a thin renderer

Status: accepted

## Context

Legacy logic is entangled with Crafty entities, wall-clock `new Date()` and `Math.random`, so it cannot be replayed or tested headlessly.

## Decision

Game rules live in `src/core` as a plain-TS fixed-step simulation at 50 Hz driven by commands. Phaser only draws state and forwards input.

## Consequences

Golden replays, headless bot matches and snapshot/restore become possible. Cost: an explicit boundary between sim and view and a `SIM_VERSION` to bump on behaviour changes.
