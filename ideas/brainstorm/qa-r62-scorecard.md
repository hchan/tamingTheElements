---
status: idea
added: 2026-11-15
---

# QA r62 scorecard (HEAD 9b3a7d2c, dev server port 7962, headless Chromium SwiftShader)

New since r61: PB2 (Versus picker compact landscape layout at 667x375 / 812x375) and the roster-24 2v2 life retune (SIM_VERSION 77, numbers only, nothing new to see on screen). Scores 0-5 versus Street Fighter / Marvel vs Capcom (r61 was 3.7 / 4.2 / 3.8). Screenshots: `~/claudetmp/qa-r62/s/` (33 files), script `~/claudetmp/qa-r62/scripts/b.mjs`.

- Fun: 3.7 (=). Same loop; hits, supers and tag swap land as before. The 2v2 life retune is invisible in a short scripted rally (Sindarosa 228 life in the 2v2 vs 286 in 1v1, Fiara 415 vs 547), so I cannot credit it as fun yet.
- Graphics: 4.2 (=). Floors, menu art and hit sparks unchanged. Fiara is still a rough blob.
- Readability: 3.9 (+0.1). Credit is entirely PB2: at 667x375 and 812x375 the Versus picker now shows the You/Computer cards, a hero grid row (Water: Curomo, Ishimi, Morblass) and a hero info card above the Fight bar. Everything else in the fight HUD is unchanged.

Page errors: none in any scripted run (menu, 1v1 Fire and Earth, 2v2 with tag, phone portrait, 667x375 and 812x375 landscape).

E2E (`corepack pnpm e2e`, port 7963, 1 worker, 514 tests): 512 passed, 2 failed (47.9m). `touch-fight-layout.spec.ts:267` (tag call does not hide the first-run card) is the known r60/r61 failure. NEW: `touch-fight-layout.spec.ts:166` (small phone landscape 2v2 picker: the "Your partner" label is clipped / Swap up and Clear do not clear the Fight! bar; `m.clipped` is true), most likely a PB2 regression.

r61 open items fixed: 1 of 7 (picker at 667x375), plus the landscape menu Echo overlap improved at 812 but only partly at 667 (see findings).
