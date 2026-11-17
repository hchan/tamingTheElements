---
status: idea
added: 2026-11-16
---

# Dynamic weather that changes during a match

Goal: weather that changes mid-match per element arena: rain, storm, snow, sandstorm, fog, heat haze, wind, lightning, with smooth transitions between them. Phase 1 is visual only (render-only particles, overlays and shaders). Phase 2 adds gameplay effects, for example rain boosts water, wind pushes air projectiles.

Why: weather is currently a fixed per-arena layer; changing weather adds drama and a reason to read the arena. See [weather-particle-art](../in-progress/weather-particle-art.md) (the static art layers this builds on), [stage-selection-hazards](stage-selection-hazards.md), [abilities-weather-elements-guide-screen](../done/abilities-weather-elements-guide-screen.md).

- Size: M for visuals, L with gameplay.
- Dependencies: phase 1 needs none beyond the weather art. Phase 2 are sim changes: weather schedule from a seeded sfc32 stream and the tick (no Math.random or Date), SIM_VERSION bump, golden and balance re-record with a stated reason, one sim agent at a time. Owner design OK for weather effects is pre-approved. Help and the guide screen must be updated.
- GPU-suitable: no for particles and shaders; optional for texture stills.
- Owner-gated: no (design pre-approved); art look should still be checked with real-game screenshots.
