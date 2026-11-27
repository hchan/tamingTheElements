---
status: done
added: 2026-11-27
---

# Cyclonius KO collapse is a streaky horizontal smear floating above the label

End state is a grey streaked disc about 45px above the name label, not resting on the label line; alpha 0.6 plus scaleX 1.25 stretches texture into horizontal streaks.

Evidence: .scratch/qa-rerun-2/cyclonius-lose-results.png (1280x720, headless Chromium, seed 7, vs fiara).
Suspected cause: src/game/fx/ko-collapse.ts:32 cyclonius spec has no floor or shadow.
Severity: Major

## Progress

Resolved 2026-11-27: Cyclonius falls back to the plain loser face (art-director 3.5, smeared grey dust); collapse removed from the table.
