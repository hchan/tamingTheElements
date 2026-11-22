---
status: done
added: 2026-11-18
triaged: d (items 1-4, 6, 7 are phone, portrait or touch, dropped 2026-11-18; item 5 is a nit, super cut-in avoids the HUD band, src/game/fx/super-view.ts:57)
---

# QA r111 findings

1. Minor: portrait phones (390x844, 360x640) show the fight behind a "Rotate your device" modal. After "Play anyway" the HUD is tiny. Shots: `p-fight.png`, `s-fight.png`.
2. Minor: the picker help text clips under the sticky Fight! bar on phones. Shots: `*-picker.png`.
3. Minor: on landscape phone the first-run hint card ("Stick moves you...") overlaps the top-left of the arena and the "FIRE x2" tag. Shot: `l-run-0.png`.
4. Minor: touch Run tile on-state not confirmed. A tap at (627,355) on 844x390 with live input changed nothing visible after 12 and 52 ticks (`l-run-1.png`, `l-run-2.png`). It may need a hold, or my synthetic tap may not match the real gesture. Needs a manual check.
5. Nit: the "SAFE" plate and the super cut-in portrait crowd the hero during a super (`d-super-a.png`).
6. Nit: the stick ring shows on a desktop viewport at 2v2 start.
7. Nit: the 12-tile action bar is dense and the tiles are small on phone.

Worked well: r110 landscape Tour plate ("Stage 1 of 9 / 3 continues left") now sits clear of the tiles (`l-tour-fight.png`). No console errors in any run. The four stages, tag swap, super, 2v2, Tour and Help all rendered.
