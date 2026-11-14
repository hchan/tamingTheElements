---
status: done
added: 2026-11-14
---

# QA r20: KO and FIGHT! text still ghosted

The FIGHT! intro word is still drawn as a low-alpha ghost mid-screen (visible in the Ice Shock shot at about step 110) and overlaps floor detail, which reads as a rendering leftover rather than an SF-style punch-in. KO text shows similar ghosting in the 60-step shots. Related: qa-r19-ko-number-still-ghosted. Make the word opaque with a hard outline and a short scale punch, then clear it.

## Done (2026-11-14)

Cause: the 8-tick alpha fade-in plus the 2x slow scale-in made the big word a translucent ghost under the damage numbers. Big calls (FIGHT!, K.O.) now draw opaque from tick 0 with a thick 10 px outline and a 10-tick punch from 1.45x down to 1x, fading only at the end (`bannerFrame` in `src/game/hud/round-cards.ts`, unit tests in `round-cards.test.ts`). Checked with real-game frames at 1280x720.
