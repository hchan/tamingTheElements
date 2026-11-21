---
status: done
triaged: obsolete (2026-11-21: all items fixed by r44/r45, dropped as phone-only, or art noted in later rounds)
added: 2026-11-14
---

# QA r42 findings (headless Chromium SwiftShader, test build of 228b4801, port 7942)

Screenshots: ~/claudetmp/qa-r42/s/*.png (menu, help, stage-{fire,water,earth,air}[-hit], 2v2-start/hit, tag-0..2/after, super-a..d, tour-card1/2, ph-* at 667x375, p2-* at 844x390, p3-* at 390x844).

- Phone 1v1 HUD (ph-fight1.png, 667x375): the left name reads "SINDAROSA 286" with no element glyph while the right shows "ROKCORE ■ 321". The element mark is dropped on the left at this width; show it on both sides (or neither).
- Phone 2v2 HUD (ph-fight2.png): names and Life now fit ("SINDAROSA ▲ 213/213"), but the first-run hint box and the tag portraits compete with the weather label; hint still covers the lower-left fighting area on a 375 px tall screen. Dock the hint above the action bar corner or shrink it.
- Tour card (tour-card2.png): the "STAGE 2 OF 9" title is dark purple on a dark backdrop and reads weakly; the "NEXT" badge overlaps the "STAGE 2 EARTH" label on the stage chips. Lighten the title fill, move badges to the chip corner without overlap.
- Portrait phone 390x844 (p3-fight.png): the rotate overlay works and "Play anyway" is clear; the HUD behind it is unreadable by design. Fine, no action.
- Tag swap (tag-1.png): the TAG! callout, ring and chevrons read well; the hint is already fading there (confirmed fade on tag call). Stills use manual stepping, so hint timing is only indicative.
- Desktop 1v1 (stage-fire-hit.png): the hint is a slim strip by design and e2e confirms it fades; in manual-step stills it never fades, so not a bug.
- Fire stage: the Fiara sprite is still noisier and lower-resolution than Pax/Echo; the translucent Sindarosa ghost (2v2-hit.png) is readable.
- Super (super-b.png): the FIGHT banner draws behind the super burst and the ice fan covers Pax; super still the best beat. The round-start "FIGHT" text remains on screen while the super fires, which muddies the burst.

## Triage 2026-11-21 (code-checked)

Fixed: phone left-name element glyph (verified r44); Tour card title and NEXT badge (verified r44); FIGHT banner under the super (`fightYields`, `src/game/hud/banner-lanes.ts:35`, verified r44); Fiara sprite noise (clean by r49).
Obsolete: phone 1v1/2v2 hint placement and the portrait rotate overlay (phone/portrait/touch work was dropped by the owner (2026-11-18)); desktop hint strip is by design (`09-help-first-run.css:51`).
Open: none.
