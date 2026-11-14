---
status: idea
added: 2026-11-14
---

# QA r32 scorecard (headless Chromium SwiftShader, test build of main df34bd1f)

Scores 0-5 vs Street Fighter / MvC (r31 was 3 / 3.5 / 3.5).

- Fun: 3 (unchanged). Snag, tag, supers and hazards are varied; normal hit feedback is still weak and Rokcore is lopsided.
- Graphics: 3.5 (unchanged). Four stages look good and rain chevrons are now calm; the tag-in hero is faint and the air Gale bands are harsh.
- Readability: 3.75 (up from 3.5). Help Jump-to row now shows on phone, the tour card is docked below the names, SUPER 3 MAX label is clear. Still weak: SUPER glow, tag-in on a dark floor.

Verified: menu, hero select, four stages (warn and active), tag swap, super, 2v2, Tour start on 844x390, Help on phone, Versus phone, Online phone, Rokcore hit. No console errors in any run. E2E subset (smoke, stage-hazards, tour, ...) 18/18 pass.

Screenshots: ~/claudetmp/qa-r32/
