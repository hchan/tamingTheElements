---
status: idea
added: 2026-11-14
---

# QA r38 scorecard (headless Chromium SwiftShader, test build of main 2809f585, port 7930)

Scores 0-5 vs Street Fighter / MvC (r37 was 3 / 3.5 / 4).

- Fun: 3. Unchanged. Systems work (tag, super, 2v2, Tour) but plain hits still read light: damage 7 of 571, small spark, only the foe moves.
- Graphics: 3.5. Four stages distinct (lava, rain-blue, sand, gale); super cut-in (GLACIER CRASH, element cut-in plus ice burst) is the best frame. Hero art good.
- Readability: 4. Terrain chips no longer sit under the TAG! call (r37 fix holds); remaining issues are phone-only (see qa-r38-phone-layout.md).

Verified, console clean (0 page errors across all runs): menu, Versus picker (1v1, 2v2), four stages, 2v2 tag (TAG! call, IN Pax / BENCH Sindarosa line), super, Tour picker (Play), Help, phone 667x375 menu/picker/1v1/2v2/help.
Screenshots: ~/claudetmp/qa-r38/ (sheet-a.png menus+stages, sheet-b.png 2v2+tag, sheet-c.png super+Tour, sheet-phone.png, sheet-hit.png, shots/*.png).
e2e (E2E_PORT=7930): see bottom of qa-r38-hit-feel.md.

Not done: Tour was only opened to the team picker, not played through; pax-vs-lavax hit capture failed (hit never landed in 40 steps, retries x3), see hit-feel file.
