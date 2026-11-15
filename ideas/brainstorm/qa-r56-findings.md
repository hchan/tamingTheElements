---
status: idea
added: 2026-11-15
---

# QA r56 findings (HEAD 3c360dff)

Screenshots under `~/claudetmp/qa-r56/s/`.

## Fixed since r55

- Roster24 B1 heroes render in real 1v1 matches (`r-kindrel-intro.png`, `r-hyalia-super.png`) and are absent from the tester Play grid (`tester-play.png`), so saves validate.
- Tester Settings path works: Settings > Advanced > Unlock full garrison > Save > badge > panel (`settings-tester-on.png`, `tester-panel.png`).
- first-run-hint e2e passes 4 of 4 here.

## Still open

- Phone portrait: the top ~45 percent of the screen is black and the arena is a ~100px strip with a tiny HUD (`pport-match.png`, `pport-super.png`). Fill the space or scale the arena up.
- The FIRST BLOOD card overlays the lower arena in every desktop shot, and a scripted "Got it" click did not dismiss it in the roster and cc runs (`r-kindrel-hit.png`, `st-Fire-super.png`).
- CC has no victim body feedback, only a small chip (`cc-daze-cyclonius-16-1.png` and siblings); the DOWN chip is dim (`cc-down-pax-*.png`).

## New observations

- Kindrel's basic hit shows no spark or impact flash (`r-kindrel-hit.png`).
- Nykra looks low-res and translucent, with poor contrast on the Void floor (`motif-nykra-1.png`); the dummy is clipped in half in the same shot.
- Tester mode turns God mode on by default; make that explicit in the panel (`tester-panel.png`).
- The tester panel scrolls and its top is clipped (`tester-panel.png`), and it still shows the word "Capture".
- docs/TESTER-MODE.md describes "Cheats on main menu", stale against the 5-entry menu (`menu-after-tester.png`).
- QA harness only: the Tour stage 9 script crashed because `__TTE__.arena` is undefined on the stage card (`tour-card9.png`); page errors were empty in every other run.

## Coverage

Menu at five sizes, hero select, 1v1 in Fire/Water/Earth/Air with hit and super, 2v2 tag swap (`team2-tag-b.png`), Tour stage cards 1-9 and fights 4-9, Help, Settings, phone landscape (`ph-super.png`) and portrait, B1 heroes vs fiara/echo/morblass/wispera, CC chips, idle motifs (treenoc, sindarosa, kindrel, nykra), tester mode.
