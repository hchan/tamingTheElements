---
status: done
added: 2026-11-13
---

# QA r6: Street Fighter / Marvel vs Capcom feel gap (juice)

Judged from fights at 1280x720 and 1920x1080 (fight-*.png, ~/claudetmp/qa6/). Combo counters and damage numbers exist; the rest of the genre language is missing.

## Missing

- Hit-stop (2-5 frame freeze on hit) and screen shake on heavy hits.
- Screen flash and zoom on Super; a super banner with the hero name and portrait.
- A big KO / round-end banner ("K.O.", "Round 2", "Fight!") with slow-mo on the last hit.
- Character-name intro cards and a short pose at round start, instead of a 4 s dead intro.
- Hit sparks scaled to element; sound cues are untested in headless runs.
- The Archon II board layer (the second pillar of the pitch) was not visible in any flow played; surface it earlier or the Archon bits are invisible to new players.

## Constraint

Hit-stop must stay presentation-only (renderer freezes, sim ticks keep determinism) or be a deterministic sim feature with goldens re-recorded and a stated reason.

## Done 2026-11-13 (presentation only)

Existing before this pass: sim hit-stop (cause 2 super, 3 KO), KO slow-mo, strength shake, super cut-in band with hero name, FIGHT!/K.O. banners. Added: round-start hero name cards in element colour that slide in and clear before FIGHT! (`src/game/hud/round-cards.ts`, drawn by `round-view.ts`), a 2.2x warm-white K.O. banner with an additive halo, a larger FIGHT!. Reduced motion: no slide, no halo. The intro length (90 ticks, 1.8 s) is sim data and unchanged; the cards fill it. Not done: Archon board layer visibility, Classic sim hit-stop.
Shots: tests/e2e/sf-juice-shot.spec.ts.
