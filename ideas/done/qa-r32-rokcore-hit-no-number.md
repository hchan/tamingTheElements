---
status: done
added: 2026-11-14
---

# Rokcore normal hit has diamond marks but no damage number

The new diamond marks show in a Rokcore vs Pax hit, but the sprites still overlap into one blob and no damage number appears, whereas the Sindarosa super hit shows a clear 72. Add a number to normal hits and a small push-back.

Shots: ~/claudetmp/qa-r32/hit-rokcore-1280.png, hit-rokcore-844.png, compare super-1280-2.png.

## Resolution (2026-11-14)
No code change. A damage number is produced (arcadeHit to sink.number, 38px); real-time shots show "14" beside the hit and life 727 to 713. The QA still was taken pre-impact under manual=1 stepping. Push-back is a sim (src/core) matter, left out of scope.
