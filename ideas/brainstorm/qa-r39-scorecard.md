---
status: idea
added: 2026-11-14
---

# QA r39 scorecard (headless Chromium SwiftShader, test build of main 1eed3c2b, port 7940)

Scores 0-5 vs Street Fighter / MvC (r38 was 3 / 3.5 / 4).

- Fun: 3.5 (+0.5). The heavier plain hit is visible: the foe flashes pale, a white core with orange streaks sits on the contact point, a big bold damage number pops. A plain strike now reads as an event, not a tick. Still held back by tiny numbers (7 of 571) and no attacker-side movement (see qa-r39-hit-feel.md).
- Graphics: 3.5. Unchanged. Four stages are distinct (lava, rain-blue, sand, gale); the Tour stage card (portraits, Location/Opponent/Difficulty/Continues, nine stage tiles) is clean and the best-looking menu screen. Spark core is a flat white disc, the weakest asset on screen.
- Readability: 4. Foe stays readable through the hit (pale wash, outline kept), HUD life numbers legible. Two regressions in hit frames: a second small "7" floats beside the big one, and stacked numbers (3, 38, 8 on a Pax multi-hit) overlap into mush. Phone issues in qa-r39-phone-and-tour.md.

Verified, 0 page errors (pageerror + console.error) across all runs: menu, Help, four stages, 2v2 with TAG! swap (IN Pax / BENCH Sindarosa, TAG 2.3s then TAG READY), super (Curomo glacier burst), Tour stage 1 played to a round win then through to the "Stage 2 of 9" card with Stage 1 CLEARED, phone 667x375 menu / Versus picker (1v1 and 2v2) / 1v1 / 2v2 / Help / Tour card.
Screenshots: ~/claudetmp/qa39/s/*.png (stage-*-hit, tag-*, super-*, tour-*, ph-*), hit sequences ~/claudetmp/qa39/hit/{fiara,pax,curomo}-hit-t{00,01,02,04,08,16}.png.
e2e (E2E_PORT=7940): hit-juice-shot, tour, tour-card, arcade-tag, touch-fight-layout, versus-layout = 36 passed, run 1 (2.7 min); hit-feel-capture passes for fiara/treenoc, pax/lavax (failed in r38, now lands), curomo/echo. Run 2: 36 passed (2.7 min).
