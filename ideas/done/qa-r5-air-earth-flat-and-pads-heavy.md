---
status: done
added: 2026-11-13
---

# Earth and air stages are low-saturation; trap pads dominate the floor

The painted floors are a big step up: fire (lava cracks) and water (ice blue) read well, and the crowd silhouettes work (this resolves most of qa-r4-fire-stage-murky). Earth is flat olive mud, and on air the pale hero (Echo) nearly vanishes against the pale floor. The dark rounded trap pads with "x2" labels are the heaviest shapes on screen, larger than the fighters, and compete with them.

Proposal: rim light or outline for pale heroes on air, more saturated earth floor, lower-contrast pads until a hero is near.

Evidence: ~/claudetmp/qa/r5/04-stage-earth.png, ~/claudetmp/qa/r5/04-stage-air.png, ~/claudetmp/qa/r5/04-stage-fire.png

Resolved 2026-11-13: arena-floor.py earth is now warm umber stone with muted moss, amber ore veins and dappled light; air is indigo sky-stone with deep joints, teal drift, glowing rune veins and luminous cloud, so pale heroes read against it. Pads (terrain-pad.ts) are about half as opaque, fewer flecks, air stain tinted indigo. Shots: ~/claudetmp/arena-ae/before-* and after-*.
