---
status: done
added: 2026-11-13
---

# Tour splash opponent portraits use legacy art that mismatches the rig art

Severity: medium (graphics). The STAGE 1 OF 9 splash shows legacy portraits: furry brown Lavax, blue-dot Wispera, grey photo-like Curomo. None match the in-match grim rig art. The FIGHT and MAIN MENU buttons are half cut off at 1280x720, and most stage tiles are black locked boxes.

Fix: bake portraits from the rigged heroes and keep the buttons inside the viewport.

Screenshot: ~/claudetmp/qa/r3/tour-splash.png.

Done 2026-11-13: the stage card roster now paints the baked-sheet portraits (`map/<sprite>.png` first frame) instead of the legacy `*Large.png`; stage tiles are shorter (3:1) with a lighter locked state so Fight and Main menu fit at 1280x720. Screenshot: ~/claudetmp/qa/r3-fix/tour-splash-1280.png.
