---
status: idea
added: 2026-11-15
---

# QA r47 scorecard (HEAD 753f253c, dev server, headless Chromium SwiftShader)

Scores 0-5 vs Street Fighter / MvC (r46 was 3.5 / 3.5 / 3.5). Goal: mystic, luminous, painterly, not cartoony.
Screenshots: `~/claudetmp/qa-r47/s/`.

- Fun: 3.5 (=). 2v2 and 3v3 tag works with clear feedback (TAG! word, ring, cooldown, SAFE chip, bench portraits). Supers have named banners and big numbers in every stage. Hit feedback is still uneven on phone (STUN and spark with no number, `ph-hit9.png`). Fiara 383 HP vs Sindarosa 213 HP in the 2v2 setup is a large asymmetry.
- Graphics: 3.5 (=). Stage backdrops and the Tour loading splash (painted Rokcore/Sindarosa/Curomo) are the best art seen. Super hit starburst is one generic white asterisk in all four elements, Echo is faint on Air, Earth props are flat vector boulders, Tour card portraits are blurry on flat purple.
- Readability: 3.5 (=). Phone name clipping and the phone first-run hint are fixed or not reproduced. New issues: the sticky Fight bar covers the partner slot and first hero row at 1280x720 and on phone, the FIGHT! banner lingers into hit frames, Online page is unframed.

## Coverage

Covered (0 page errors in every run): 2v2, 3v3, tag swap, a super in Fire/Water/Air/Earth, Tour (pick, stage card, splash, fight, KO, round end), Online page layout, phone 667x375 touch full match (2-0 to Victory, Rematch / Change fighters / Main Menu).

Not covered: a real two-browser Online handshake (only the form was inspected), a 24-hero picker (roster is still 12), a full Tour run to stage 9.

## r46 open items

- Phone picker name clipping: not reproduced. Tile check reported ok for all 12 tiles at 89 px wide, names fully visible after scroll (`ph-pick-b.png`).
- Phone first-run hint covering the arena: not seen in `ph-intro.png` or later phone frames. Desktop hint strip still appears over the arena bottom at the tag moment (`team2-tag-a.png`), smaller.
- Uneven hit feedback: persists (`ph-hit9.png`).
- Echo low contrast on Air, Earth props cartoony: both persist.
- Picker still shows 12 heroes, not 24.
