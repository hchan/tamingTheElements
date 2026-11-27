---
status: done
added: 2026-11-27
---

# Lavax KO collapse floats about 30px above the label and reads as nearly standing

End state (verified at 3.5 s) is a dark grey ash-tinted Lavax, still about 130px tall, with a visible gap to the name label; no floor or shadow so it is not anchored.

Evidence: .scratch/qa-rerun-2/lavax-lose-results.png, lavax-lose-results-late.png (1280x720, headless Chromium, seed 7, vs fiara).
Suspected cause: src/game/fx/ko-collapse.ts:34 lavax spec has no floor or shadow (scaleY 0.6).
Severity: Minor

## Progress

Resolved 2026-11-27: Lavax gets floor 26, shadow 0.3, scaleY 0.42, scaleX 1.15; art-director approved.
