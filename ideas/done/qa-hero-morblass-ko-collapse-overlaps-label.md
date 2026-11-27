---
status: done
added: 2026-11-27
---

# Morblass KO puddle overlaps the name label text

The pooled water spans x 365-635 and its bottom edge touches the MORBLASS label glyphs (floor 24 pushes it down slightly too far); readable but cluttered.

Evidence: .scratch/qa-rerun-2/morblass-lose-results.png (1280x720, headless Chromium, seed 7, vs fiara).
Suspected cause: src/game/fx/ko-collapse.ts:36 morblass floor: 24 (rokcore floor 22 only touches the label, acceptable); try about 14.
Severity: Minor

## Progress

Resolved 2026-11-27: Morblass floor 24 to 14; art-director approved.
