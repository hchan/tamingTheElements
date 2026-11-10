# ADR-0005: AABB in the sim, no Arcade physics

Status: accepted

## Context

Legacy collision is simple axis-aligned boxes with hand-written movement. Phaser Arcade physics would run outside the deterministic sim.

## Decision

Collision is AABB overlap tests inside the sim. Phaser physics is not enabled.

## Consequences

Collisions are deterministic and unit-testable. Cost: no free features from a physics engine; none are needed.
