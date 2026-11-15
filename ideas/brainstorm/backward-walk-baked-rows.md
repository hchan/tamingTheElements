---
status: idea
---
# Baked backward-walk rows (Phase 2 of backward-walk-animation)

Phase 1 plays the existing walk row reversed plus a per-hero procedural gait. Phase 2: bake a dedicated "walk-back" row per hero in the rigs (retreating guard posture, no mirrored stride) and select it in the pose layer when `back > 0.5`. Needs the rig/bake pipeline, atlas manifest and size-budget changes, so it is a separate work package.
