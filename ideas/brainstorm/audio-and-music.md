---
status: idea
added: 2026-11-12
---

# Music and sound layers

Per-stage music, KO music cut, adaptive intensity at low life, ability-specific sounds, volume sliders per bus. Currently only synth cues in the `arcade-audio` chunk.

Progress 2026-11-12: slice 1 done, hit variety. The sampled `damage` cue now plays at a rate that drops with hit size and steps through a fixed 5-entry cycle (`src/game/audio/hit-variety.ts`, used by `AudioManager.consume`; no new asset, so no licence entry). Still open: per-stage music, KO music cut for Classic, low-life intensity, ability-specific sounds beyond the legacy casts, per-bus volume sliders in Settings.
