---
status: done
triaged: already-fixed (hero-grade.ts syncFrames copies late-registered right0/left0 frames to the ~grim copy; e2e collectors fail on "has no frame|missing frame")
added: 2026-11-13
---

# QA: missing map-portrait frame warnings on every fight

Severity: medium. QA evaluator pass 2026-11-13 on main 4ddd5ca4. Screenshots: ~/claudetmp/qa/shots/hit-2.png (console only)

Every match logs Phaser warnings 'Texture "%s" has no frame "%s"' (format string not interpolated) for map:<hero>~grim right0 and left0, for all eight heroes seen (sindarosa, lavax, curomo, ishimi, cyclonius, wispera, pax, rokcore). A frame is missing from the baked sheets, so a pose silently falls back. Fix the missing frames or the lookup, and make the e2e error collectors fail on this warning.
