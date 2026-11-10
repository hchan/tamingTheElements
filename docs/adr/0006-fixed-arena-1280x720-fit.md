# ADR-0006: Fixed logical arena 1280x720 + FIT scaling

Status: accepted

## Context

Legacy arena size depends on the window (`(innerWidth-20)/displaySettings`), so positions and ranges vary per player.

## Decision

The sim uses a fixed 1280x720 logical arena. Phaser scale mode FIT letterboxes it. Art is not pixel art, so `roundPixels` is false.

## Consequences

Reproducible geometry. Cost: positional parity with legacy is relative, not absolute.
