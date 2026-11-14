---
status: done
added: 2026-11-14
---

# Tag entrance flash is cluttered

The tag-in flash (white ring, yellow chevrons, three lines) is unclear and the tagged-in sprite is invisible during it. Fade the sprite in under the flash, and simplify the burst. Shots: tag-swap-a.png, tag-swap-b.png.

Note (2026-11-14, fx-r30): not fixed; the flash lives in src/game/hud/tag-view.ts, owned by the banner/tag agent.

Resolved (2026-11-14, tag-flash): tag-view.ts now draws one pale ring plus a faint wash (30% of the old core), no speed lines and no black rim, so the fading-in sprite shows through. Shots in ~/claudetmp/tag-flash/ (before-*, after-*).
