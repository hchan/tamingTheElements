---
status: done
added: 2026-11-14
---

# Super hit draws the normal white number on top of the gold one (r18)

At the super's hit frame (1280x720 and 844x390, Curomo vs Pax, shockSeek 70) the big gold "120" has the small white "120" printed over its middle, so it reads as "1 120 0". The same collision shows on ordinary-hit frames in the Play fight (gold "336" with white "36" and "30" over it) and again behind the K.O. caption on phone. The gold number is the hit; the white one should be suppressed (or the gold one should replace it) when the hit is a super or a heavy hit. Check: screenshot at the super hit shows exactly one number.

Done 2026-11-14: A super hit (strength 3) no longer draws the small white number (event-fx.ts arcadeHit); only the gold super number shows. Verified by headless screenshots at 1280x720 and 844x390. The K.O.-caption overlap on phone is not separately addressed: the gold number now stands alone, caption collision still possible when a super lands the KO.
