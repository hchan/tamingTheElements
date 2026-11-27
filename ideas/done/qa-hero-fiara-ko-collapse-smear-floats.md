---
status: done
added: 2026-11-27
---

# Fiara KO collapse is an unreadable bronze smear floating above the label

Loser Fiara collapses to a flat ribbon about 55px above the name label (no floor anchor, no shadow); it does not read as a burnt-down dragon and is not resting on the label line. Same smear on the AI Fiara in win screenshots.

Evidence: .scratch/qa-rerun-2/fiara-lose-results.png, fiara-lose-results-late.png (3.5 s final state), fiara-win-results.png (1280x720, headless Chromium, seed 7, vs fiara).
Suspected cause: src/game/fx/ko-collapse.ts:31 fiara spec has no floor or shadow (only morblass/rokcore do); scaleY 0.5 with sepia filter flattens the art.
Severity: Major (art-director anchoring/readability)

## Progress

Resolved 2026-11-27: Fiara falls back to the plain loser face (art-director score 3, bronze scarf); collapse removed from the table.
