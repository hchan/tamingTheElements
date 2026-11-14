---
status: idea
added: 2026-11-14
---

# QA r30 scorecard (headless Chromium, SwiftShader, test build of main ac6089dc)

Scores 0-5 against Street Fighter / MvC.

- Fun: 3. Tag, Snag rope, supers and hazards give variety, but hit feedback is soft, so combat lacks the crunch of SF/MvC.
- Graphics: 3.5. Menu, stage art and the super cinematic are strong. Small hero sprites, a pale Echo on Air, and noisy Water floor lines hold it back.
- Readability: 3. Hazard telegraphs ("TIDE 1s", "GUST 1s") and the ROOTED ring read well. The HUD is dense, status chips duplicate, bars mismatch their numbers, and the First Blood card covers the arena.

Checked and good:
- Menu has 5 buttons and no mode words.
- Help shows the new Jump-to row on desktop (scr-d-help.png); on phone the top shows only the tab row (scr-p-help.png), so the Jump-to row is not visible there.
- Versus, Online and Help on phone have no targets under 44 px.
- 2v2 picker is clear.

Screenshots: ~/claudetmp/qa-r30/.

E2E subset (touch-fight-layout, help-controls, versus-*, arcade-juice, stage-hazards): 34 passed, 0 failed (1.9 min). No real failures.
