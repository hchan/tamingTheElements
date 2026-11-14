---
status: idea
added: 2026-11-14
---

# KO damage number still reads as a ghosted 336 (r19)

Seen in headless Chromium at 1280x720 and 844x390 (seed 7, Sindarosa vs Rokcore, ko-60 and ko-200 shots in ~/claudetmp/qa-r19/): the big gold KO number draws as "3" + "36" with a doubled first glyph, like two numbers (hit and combo total?) stacked at nearly the same spot. Rokcore max life is 321, so 336 is also an odd value. Same family as qa-r18-super-number-doubled, now on the KO frame. Fix: one number per event, or merge the combo total into the HITS/DMG counter at left.
