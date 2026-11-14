---
status: idea
added: 2026-11-14
---

# KO camera punch-in not visible in the seek frames (r19)

The r17 punch-in fix landed (ko-fx-shot passes) but the shockSeek frames at 60/200/400 show the same framing as before the KO: hero and Rokcore at the same size and position, no zoom toward the KO fighter. Either the zoom only runs in real time and manual stepping hides it, or the peak of 1.12x is too small to see. Add an arena probe (cameraZoom) and a test that pins zoom above 1.05 at the peak tick, plus a before/after screenshot pair; if it is too subtle, push the peak to 1.2x. The red/blue split is also hard to judge from stills.

Note (r19-fx): not changed (arena-pan is off limits this round). Likely the seek probe bypasses the real-time pan; next step is the cameraZoom probe and test above.
