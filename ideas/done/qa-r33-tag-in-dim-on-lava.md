---
status: done
added: 2026-11-14
---

# Tag-in hero still dim on lava; TAG! overlaps FIGHT!

Pax tagged in on the lava stage has a pale rim, but the body stays nearly the floor colour, so the active fighter is hard to find. The raised TAG! call is big and readable but shares the frame with the lingering FIGHT! text (manual stepping, so possibly an artefact; recheck in real time). Idea: a brief brightness pulse on the new fighter for about 0.5 s, and clear FIGHT! on first input.

Screenshots: ~/claudetmp/qa-r33/tag-swap-a.png, tag-swap-b.png

## Resolution (2026-11-14)
Added a 0.5 s pale body wash on the tagged-in hero (tag-view.ts) beside the rim light. The TAG!/FIGHT! overlap was a manual-step artefact: the call waits for the banner lane.
