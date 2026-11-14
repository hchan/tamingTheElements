---
status: idea
added: 2026-11-14
---

# QA r26: hit flash still reads as a hard-edged white silhouette clipped to frame rectangles

Repro: build `--mode test`, open `/?seed=7&manual=1&hero=treenoc&foe=sindarosa` (or `hero=rokcore&foe=treenoc`), stepLive 180, screenshot. The struck sprite flashes solid white with straight vertical cuts at the sprite frame bounds (Treenoc cut near x=155). Also visible on Rokcore after a Fiara super.

`ideas/done/qa-hit-flash-white-rectangle.md` was marked fixed (additive wash); this looks like a recurrence on large or multi-part sprites.

Evidence: `~/claudetmp/qa26/st-treenoc-sindarosa-180.png`, `st-rokcore-treenoc-180.png`, `super-fiara-30.png`.

SF/MvC hit flashes are subtle colour pops, not clipped cut-outs. Suggest a tint or additive pass limited to the sprite alpha, not the frame.
