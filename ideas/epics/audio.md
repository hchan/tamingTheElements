---
status: epic
added: 2026-11-16
---

# Epic: Audio and music

Sound effects, music and generated sound.

- Suggested order: Finish audio-and-music, then generated sound.
- Size: M.
- Dependencies: Asset manifest (one agent at a time).
- Owner-gated: None.

Member ideas, in suggested priority order (work them as separate small work packages):

- [audio-and-music](../in-progress/audio-and-music.md) (in progress): Music and sound layers. Per-stage music, KO music cut, adaptive intensity at low life, ability-specific sounds, volume sliders per bus.
- [ai-generated-sound](../in-progress/ai-generated-sound.md) (in progress): AI-generated sound effects and music. Today every cue is synthesised in the browser (src/game/audio/element-sfx.ts:

## Bundles (2026-11-17)

Groups of ideas that touch the same files, so one agent can take the whole bundle. Flags: SIM = sim-changing (needs an Opus plan, a SIM_VERSION bump and a golden re-record with a stated reason, one sim bundle at a time); OWNER-GATED = wait for the owner; PC = heavy generation, balance or e2e work can run on the GPU PC; needs browser/e2e = run Playwright (headless) before calling it done.

Only two members: one small bundle.

### AU-1 Music and generated sound

- Members: [audio-and-music](../in-progress/audio-and-music.md), [ai-generated-sound](../in-progress/ai-generated-sound.md)
- Size: M
- Shared files: src/game/audio/*, tools/audio-gen/*, asset manifest, tools/ci/size-budget.json
- Flags: PC-offloadable (generation); no sim impact; no browser needed except one smoke
- Parallel: Parallel with HUD, FX and SIM bundles; serial with any manifest or size-budget bundle.
