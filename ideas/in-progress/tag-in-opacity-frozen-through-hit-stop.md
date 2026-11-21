---
status: in-progress
added: 2026-11-16
---

# The 0.8 tag-in opacity stays frozen through hit-stop

A hero that tags in is drawn at 0.8 opacity for its entrance; during a hit-stop the sim (and so the entrance timer) is frozen, so the 0.8 holds for the whole stop and the fighter looks half-faded while being hit. Follow-up: drive the entrance fade from wall-clock or let it finish when a hit lands, and check with a real-game screenshot of a tag-in into a hit.

## Progress

Fade now runs on the VFX clock (`fxMs`, kept running through hit-stop) via `applyPose`'s `fadeAgeMs`; slide and pop stay on the pose clock. Test in pose-math.test.ts.
