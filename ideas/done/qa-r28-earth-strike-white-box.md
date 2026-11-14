---
status: done
added: 2026-11-14
---

# QA r28: earth hazard strike draws a pale white rectangle around the fighter

hazard-desk-earth-active.png (reproduced twice): a pale white box surrounds Rokcore during the earth strike. It looks like a render artifact (untextured or blend-mode quad), not an effect. Not shown to be SwiftShader-specific; check the earth strike sprite or graphics fill.

Progress 2026-11-14: done. Cause was the 2-tick impact flash, a filled additive white rectangle over the whole earth box. It is now an outline plus a small round burst.
