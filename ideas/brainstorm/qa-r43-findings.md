---
status: idea
added: 2026-11-14
---

# QA r43 findings (headless Chromium SwiftShader, dev server of 9e0224d0, port 7944)

Screenshots: ~/claudetmp/qa-r43/s/*.png (same set as r42: menu, stage-*, tag-*, super-*, tour-*, ph-*, p3-*).
Menu shows exactly Play, Versus, Online, Settings, Help; no banned words seen on the menu, pickers or Tour card.

r42 issues, all still present (nothing in the tree touched them):
- Phone HUD glyph (ph-fight1.png, 667x375): left name "SINDAROSA 286" has no element glyph, right shows "ROKCORE ■ 321". Persists. Show on both sides or neither.
- Hint covering play area (ph-fight1/2.png): the "Stick moves you..." box with "Got it" still sits over the lower-left fighting area on a 375 px tall screen. Persists. Dock above the action bar corner or shrink.
- Tour card contrast/overlap (tour-card2.png): "STAGE 2 OF 9" title still dark purple on dark; the "NEXT" badge still overlaps "EARTH" in "STAGE 2 EARTH" (LOCKED badges also touch "WATER"/"EARTH"/"AIR"/"VOID" text on the lower chips). Persists, slightly wider than r42 noted.
- FIGHT banner behind super (super-b.png): "FIGHT" is still drawn under the ice fan while the super fires. Persists. Hide the banner when a super starts.
- Fiara sprite (stage-fire-hit.png, stage-air-hit.png): still the noisy, lower-resolution flame figure next to crisp Pax/Echo. Persists.

New or notable:
- Phone 2v2 (ph-fight2.png): names fit ("SINDAROSA 213/213") but again with no left glyph; tag portraits crowd the weather label. Same as r42.
- Desktop 2v2 tag (tag-1.png): TAG! callout, ring and chevrons read well; hint is fading. Good.
- Desktop first-run hint is a slim strip and fine; a hero info strip (ADREN/SAFE/EMBER chips) under the HUD is small but legible.
- Air stage: GALE 9 meter and "AIR x2" chips are clear; stage tint is readable.
- Page errors: 0.
