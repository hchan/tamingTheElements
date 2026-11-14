---
status: done
added: 2026-11-14
---

# Tour stage strip clips at the right edge on phone landscape (r15)

At 844x390 the Tour stage thumbnail strip is cut off at the right (STAGE 5: AIR, LOCKED is truncated). The difficulty diamonds, dots and the word continues are also unlabeled for a new player. Wrap or scroll the strip and add short labels or tooltips. See 43-tour-pl.png and 44-tour-pl-stage.png.

Done 2026-11-14 (qa-r15-layout): fixed; verified by headless screenshots at 1280x720, 844x390, 390x844, tests/e2e/layout-r15.spec.ts and a slim-hud unit test. Tour tiles also got Level/Continues labels and tooltips.
