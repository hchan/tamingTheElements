# ADR-0017: dependency-cruiser + ESLint for layer boundaries

Status: accepted

## Context

The core/game/ui split only holds if imports are checked mechanically.

## Decision

dependency-cruiser enforces which layers may import which, and ESLint enforces file-level rules such as no `Date` or `Math.random` in core. Both run in CI.

## Consequences

Architecture violations fail the build. Cost: rules need upkeep as layers evolve.
