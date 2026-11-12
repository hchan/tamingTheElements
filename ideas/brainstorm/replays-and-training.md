---
status: idea
added: 2026-11-12
---

# Replays and training mode

Save, watch and share replays (the replay format and hash checks exist); a training dummy with frame data and input display; ghost opponents from recorded replays.


## Progress (2026-11-12)

Already there: save (local store), download, viewer with hash verification, pause/step/1x/2x. Shipped now: 0.5x slow motion in the viewer. Shipped now: input display in the viewer (`src/game/app/input-display.ts`): both fighters' last six command runs as direction plus button chips with hold ticks, an "Inputs: on/off" toggle (aria-pressed), labelled lists, no sim change. Still open: training dummy with frame data, a live input display in training/online, ghost opponents, sharing.
