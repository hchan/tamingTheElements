# ADR-0004: No transcendental Math in core; LUTs + integer dirs

Status: accepted

## Context

`Math.sin`/`cos`/`atan2` and similar may differ across engines and platforms, which would break cross-browser replay determinism.

## Decision

`src/core` uses lookup tables and integer direction indices instead of transcendental functions. Lint rules forbid `Date`, `Math.random` and transcendentals there.

## Consequences

Replays are bit-stable across browsers. Cost: a coarser set of directions and extra table code.
