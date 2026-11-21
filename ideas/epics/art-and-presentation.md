---
status: epic
added: 2026-11-12
---

# Epic: Art, effects and arenas

Rigged and baked art, effect sprites, stage backgrounds, tilemap hazards, Phaser 4 effects.

Member ideas (all in [../brainstorm/](../brainstorm/) unless moved; work them as one theme, in separate small work packages):

- [art-consistency-batches](../in-progress/art-consistency-batches.md)
- [effect-batches-plan](../brainstorm/effect-batches-plan.md)
- [effect-sprite-style-pass](../in-progress/effect-sprite-style-pass.md)
- [hero-rigs](../brainstorm/hero-rigs.md)
- [rig-gen-shared-palette](../brainstorm/rig-gen-shared-palette.md)
- [phaser4-effects](../brainstorm/phaser4-effects.md)
- [free-sprite-research](../brainstorm/free-sprite-research.md)
- [sf-stage-backgrounds-crowds](../brainstorm/sf-stage-backgrounds-crowds.md)
- [stage-selection-hazards](../brainstorm/stage-selection-hazards.md)
- [curomo-ability-visibility](../done/curomo-ability-visibility.md)
- [audio-and-music](../in-progress/audio-and-music.md)

## Filed 2026-11-17 (round-note filing and cross-listing)

Added so every brainstorm idea sits in an epic. Members stay in their own folder; cross-listed ideas also appear in another epic.

- [grim-arena-environments](../in-progress/grim-arena-environments.md): Grim arena environments (floor, props, atmosphere)
- [blender-rigging-pilot](../in-progress/blender-rigging-pilot.md): Blender rigging pilot (headless, driven by Claude Code)

## Bundles (2026-11-17)

Groups of ideas that touch the same files, so one agent can take the whole bundle. Flags: SIM = sim-changing (needs an Opus plan, a SIM_VERSION bump and a golden re-record with a stated reason, one sim bundle at a time); OWNER-GATED = wait for the owner; PC = heavy generation, balance or e2e work can run on the GPU PC; needs browser/e2e = run Playwright (headless) before calling it done.

### AP-1 Effect sprite style batches

- Members: [art-consistency-batches](../in-progress/art-consistency-batches.md), [effect-batches-plan](../brainstorm/effect-batches-plan.md), [effect-sprite-style-pass](../in-progress/effect-sprite-style-pass.md), [phaser4-effects](../brainstorm/phaser4-effects.md), [free-sprite-research](../brainstorm/free-sprite-research.md)
- Size: L
- Shared files: asset manifest, public/assets/fx/*, tools/assets/*, src/game/fx/*
- Flags: PC-offloadable (image generation), needs browser/e2e, owner art review (too cartoony feedback)
- Parallel: Art lane: serial with every manifest bundle (HA-1, HA-3, AE-3).

### AP-2 Stage backgrounds and hazards

- Members: [sf-stage-backgrounds-crowds](../brainstorm/sf-stage-backgrounds-crowds.md), [stage-selection-hazards](../brainstorm/stage-selection-hazards.md), [grim-arena-environments](../in-progress/grim-arena-environments.md)
- Size: M
- Shared files: Arena.ts, src/game/fx/terrain-*, asset manifest
- Flags: needs browser/e2e, owner art review
- Parallel: Serial with AE-3 (same files); never two Arena.ts agents.

### AP-3 Rig tooling

- Members: [hero-rigs](../brainstorm/hero-rigs.md), [rig-gen-shared-palette](../brainstorm/rig-gen-shared-palette.md), [blender-rigging-pilot](../in-progress/blender-rigging-pilot.md)
- Size: M
- Shared files: tools/rig-assist/*, tools/assets/*
- Flags: PC-offloadable; tooling only, no manifest change until output is approved
- Parallel: Parallel with everything except other rig bundles (HA-3).
