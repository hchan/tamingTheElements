---
status: in-progress
added: 2026-11-12
---

# Music and sound layers

Per-stage music, KO music cut, adaptive intensity at low life, ability-specific sounds, volume sliders per bus. Currently only synth cues in the `arcade-audio` chunk.

Progress 2026-11-12: slice 1 done, hit variety. The sampled `damage` cue now plays at a rate that drops with hit size and steps through a fixed 5-entry cycle (`src/game/audio/hit-variety.ts`, used by `AudioManager.consume`; no new asset, so no licence entry). Still open: per-stage music, KO music cut for Classic, low-life intensity, ability-specific sounds beyond the legacy casts, per-bus volume sliders in Settings.

Progress 2026-11-13: slice 2 done, all synth (no new assets). Per-bus music and sound-effect volume sliders in Settings (`src/game/platform/volume-setting.ts`, device-local localStorage `tte.volumes`, applied when the battle audio is built). Low-life heartbeat in the `arcade-audio` chunk (`heartbeatGap`, quickens below 25% life, view-state driven). Per-element cast cues (fire/water/earth/air). The Arcade KO music cut already existed. Still open: per-stage music, KO music cut for Classic.

Progress 2026-11-13: slice 3 done, all synth (no new assets). Standalone elemental sound vocabulary: `playSfx(kind, element)` in `src/game/audio/sfx.ts` (eager, tiny) with the synth in the lazy `element-sfx` chunk (`src/game/audio/element-sfx.ts`). Kinds click, confirm, cast, hit, cleanse; each of fire/water/air/earth/void has its own voice (water drip and splash, fire crackle and whoosh, air gust, earth thud and crack, void hum). Needs no Arena: it makes its own AudioContext on the first pointer/key/touch gesture (silent before, per autoplay policy), resumes it, honours the saved mute flag and the Settings sound-effect volume, caps simultaneous layers. A future Cleanse ability calls `playSfx('cleanse', element)`. Not yet wired to any UI click or sim event (wiring into the eager `index` chunk needs a budget check); until then the chunk is tree-shaken out of the build. Still open: wire UI clicks, per-stage music, KO music cut for Classic.
