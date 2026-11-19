---
status: idea
added: 2026-11-19
---
# QA r127 scorecard

Build: main at f523842e, `vite build --mode test`, headless Chromium (SwiftShader) 1280x720, manual stepping plus a few live key presses. No smoke or e2e run (full e2e holding the PC). Screenshots: `.scratch/r127/` in the worktree (branch `worktree-agent-af9b685a441aaac53`; scripts `.scratch/qa.mjs`, `.scratch/qa2.mjs`).

Covered: menu `01`, Versus picker `02`, 1v1 on fire/water/earth/air `10-stage-*`, live hit `20`, super banner `31-super-t10`, 2v2 picker `40`, 2v2 start `41`, tag `42`/`43`, Tour picker `50`, Tour card `51`, Tour fight `53`, Help `60`, Settings `61`. Phone skipped (parked).
Word scan of page text on menu, Versus, 2v2 picker, Tour, Help, Settings: no Classic, Arcade, ruleset or Capture. Console errors: none.

| Area | Fun | Graphics | Readability | Evidence |
|---|---|---|---|---|
| 1v1 arenas | 3 | 4 | 4 | Four distinct stages (lava cracks, ice, sand, frost), clear bottom ability bar; frame `20` shows a big "29" hit number and combo tally but only one slow trade, no hit-stop visible in a still |
| Tag / super | 4 | 4 | 4 | `31-super-t10` HELLFIRE LANCE band with portrait, element name, fighters stay visible; `42` tag shows "FIGHT!" and the HUD with bench portraits and cooldown |
| 2v2 and Tour | 3 | 4 | 3 | `53` Tour fight shows both benches in the top bar, but the foe Wispera is a tiny orb next to a dragon; the stage 1 card (`51`) is clear |
| Menus, Help, Settings | n/a | 3 | 3 | Menu (`01`) clean with a gold Online CTA; Help chips (`60`) still ragged in 2-3-4 rows; picker text under the "More below" chip (`02`, `50`) |

vs Street Fighter / MvC: stage art and the super band approach the genre; hit weight, sprite scale parity and menu polish lag.
