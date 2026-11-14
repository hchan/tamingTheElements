---
status: idea
added: 2026-11-14
---

# QA r7: scorecard, and which qa-r6 findings are still open

Build: main 93380b0a, headless Chromium (SwiftShader), 1280x720 and 390x844. Shots in ~/claudetmp/qa-r7/ (menu, help, versus-picker, hero-select, fight-{fire,water,earth,air}[-intro|-go|-attack], super-a/b/c, 2v2-picker, 2v2-fight, tag-swap-a/b, tour-pick, tour-stage1, tour-fight, phone-menu, phone-picker, phone-fight, settings). No console errors in any run.

## Scores (0-5, vs Street Fighter / Marvel vs Capcom)

- Fun: 3. Weather, traps, tag, supers and snag give depth; first seconds still passive, and the 272 vs 765 HP default matchup is lopsided.
- Graphics: 3. Arena floors much improved (water and air lighter, fire lava best); sprites flat, no rim light, mixed legacy/rigged look, menu has no key art.
- Readability: 2.5. Flat green life bars, unlabeled pips, debug-style floor labels, crowded top strip (buff chips, weather box, sun/rain box).

## qa-r6 status

- Air/water floor darkness: improved (water is a readable mid blue, air a pale lavender). Mostly fixed; dark heroes (Echo, Cyclonius) still low contrast on the air floor. See qa-r7-hero-contrast-and-sprite-look.md.
- Earth props: the teal crystal prop (thick outline) is still flat vector against the painted floor. Open.
- Dead band and hard seam: STILL OPEN on menu, Help, Tour at 1280x720 (seam at y=645) and on phone (bottom 20% empty). Menu has no key art. Open.
- Floor labels "FIRE x2", "AIR x2", "WATER +HP": STILL OPEN, on every stage.
- Unlabeled pips and flat life bars: STILL OPEN (no element tint, no chip trail, no low-HP colour).
- Versus default matchup and "You: X" vs highlighted card: STILL OPEN (panel says You: Sindarosa while the detail pane shows Curomo with Add to team).
- First-run card and tooltip key hints: now correct (1/7/8/9, 3 for Tag). Fixed.

New findings: see the other qa-r7-* files.
