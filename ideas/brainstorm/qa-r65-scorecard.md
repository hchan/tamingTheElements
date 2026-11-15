---
status: idea
added: 2026-11-15
---

# QA r65 scorecard (HEAD a00253c4, SIM_VERSION 79, dev server port 7965, headless Chromium SwiftShader)

Coverage: Versus 1v1 Hard and Normal (idle-player probe about 80 s each, plus an alternating-attack run), Water and Air 1v1, a super (Curomo, Glacier Crash), a 2v2 tag swap at 1280x720, a Tour fight, the Versus picker, the menu, and 2v2 at 812x375 with the touch Tag button. Scores 0-5 versus Street Fighter / Marvel vs Capcom (r64 was 3.8 / 4.2 / 3.8). Screenshots in `~/claudetmp/qa-r65/s/` (about 60 files), scripts `~/claudetmp/qa-r65/scripts/b.mjs` and `s.mjs`. No page errors in any run.

- Fun: 3.9 (+0.1). The AI now closes the gap at once and does not stall: an idle Fiara (547 hp) was beaten by Rokcore in about 26 s on Hard (5 s: 518, 16 s: 308, 26 s: dead) and about 30 s on Normal, round after round, with no stretch over 60 s without damage. It no longer looks passive. The cost is that it pins a passive player into the left wall (see findings) and the fight there is partly off screen.
- Graphics: 4.2 (=). Water floor (cold teal, 77 hit-number ghost) and Air floor (lavender, wind streaks) read as distinct stages; the Glacier Crash banner is big and clear.
- Readability: 3.8 (=). Life numbers, HURT / LOW, STUN / SAFE / EMBER pills and the TAG cards are clear; losses are the wall-pinned fighter clipped at the screen edge and the first-blood hint overlapping the action bar.

Per area: AI feel Hard 4.2, AI feel Normal 4.0, Water 1v1 4.2, Air 1v1 4.0, super 4.3, tag swap 1280 3.9, Tour fight 3.9, picker 4.0, phone 812x375 2v2 3.8 (HUD crowded but legible, Tag button 48 px and works), menu 4.2.
