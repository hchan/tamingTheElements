---
status: idea
added: 2026-11-15
---

# QA r56 scorecard (HEAD 3c360dff, dev server port 7985, headless Chromium SwiftShader)

New since r55: roster24 Batch 1 heroes (Kindrel, Nykra, Quarrak, Hyalia, behind `?ff=roster24`), CC status chips (`?ff=cc`), idle motifs, tester-mode garrison fix. Scores 0-5 versus Street Fighter / Marvel vs Capcom (r55 was 3.5 / 4.2 / 3.6). Screenshots: `~/claudetmp/qa-r56/s/` (151 files). E2E used port 7984.

- Fun: 3.6 (+0.1). Four more fighters with their own kits and supers (Hyalia STORM BLOOM, Kindrel Ember Bite / Cinder) and CC chips (DAZED 2s, DOWN 1s) add variety; 4 stages, 2v2 tag swap, Tour stages 1-8 and both phone orientations ran. Stills still cannot show hit-stop or audio; CC has no body feedback on the victim; Kindrel's basic hit shows no spark.
- Graphics: 4.2 (=). New heroes render from their own sheets and match the world, super banners are strong. Nykra reads low-res and translucent against the purple Void floor; the dummy sprite is clipped in half in the motif shot.
- Readability: 3.6 (=). Desktop and phone landscape HUDs are clear. Phone portrait still wastes the top half as black with a tiny arena strip, and the FIRST BLOOD card still overlays the lower arena.

E2E subset (port 7984, 1 worker): first-run-hint, idle-motif, roster24-b1-shot, status-fx, tester-mode, 25 of 25 passed (the r55-era note of a first-run-hint failure did not reproduce).
