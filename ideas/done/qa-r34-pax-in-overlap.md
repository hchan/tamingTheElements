---
status: done
added: 2026-11-14
---

# 2v2 tag: outgoing fighter overlaps the incoming one during PAX IN!

In the lava 2v2 tag swap the outgoing Sindarosa sprite sits on top of the incoming Pax while the PAX IN! banner shows, so the arriving fighter is hard to read for a few frames. The "Can't swap: stunned" line also lingers bottom-left as dim text. Idea: fade the outgoing sprite out quickly (or offset it) before the arrival flash, and give the swap-refused line a brighter colour.

Screenshot: ~/claudetmp/qa-r34/tag-1280-1.png

## Resolution

Resolved 2026-11-14: a tag-in makes the fallen hero's KO ghost skip to its fade (pose-layer.ts clearKoGhosts) and the ghost sits just under the arriving sprite; the swap-refused line is brighter and is cleared when a tag lands (Arena.feedCleanse, SwapNotice.clear). Checked with headless 1280x720 screenshots (~/claudetmp/qa-r34b/tag-1.png).
