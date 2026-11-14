---
status: idea
added: 2026-11-14
---

# Tag-in hero is still invisible during the entrance flash

Unchanged since r30. In the 2v2 swap the incoming Pax has only a white ring and yellow chevrons around an empty spot, with no sprite visible. Fade the sprite in under the burst. Shots: /Users/henry.chan/claudetmp/qa31/tag-swap-a.png, tag-swap-b.png.

## Re-check (2026-11-14)
In real-time play Pax is visible by about 370 ms; the QA shots came from the manual=1 harness, where the pose clock is stalled so the 320 ms fade-in never advances. At 120 ms the fade is faint (brown on brown). Optional: floor the tag-in alpha near 0.35 in src/game/views/pose-math.ts (outside fx/hud ownership).
