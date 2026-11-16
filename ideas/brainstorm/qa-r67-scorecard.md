---
status: idea
added: 2026-11-15
---

# QA r67 scorecard (HEAD 286938fc, dev server port 7967, headless Chromium SwiftShader)

Coverage: menu, Versus picker, Settings, Help, the Play hero picker and Tour (map, splash, fight, tag swap), a Versus Hard fight (active play plus an idle probe), a super (banner), a real-time K.O. with round end and ROUND 2, phones at 812x375 and 390x844. Scores 0-5 versus Street Fighter / Marvel vs Capcom (r66 was 3.9 / 4.2 / 3.9). Screenshots in `~/claudetmp/qa-r67/s/`, scripts in `~/claudetmp/qa-r67/scripts/`. No console or page errors in any run.

- Fun: 3.9 (=). The K.O. flow (K.O. banner, red X, round pip, ROUND 2, restart in about 1.5 s) is crisp, but the Hard AI still pins an idle player to the left wall (x 435 -> 0, Sindarosa half off screen).
- Graphics: 4.2 (=). Stage floors and the phone landscape HUD look good; Wispera's splash portrait is still blurry.
- Readability: 3.9 (=). Life bars are still equal length for 228 vs 455 HP, (kept on purpose, WP-HF1: equal tracks, the 100 HP notches show the pool) round pips are tiny, the TAG! banner overlaps damage and combo text, and the Tour map Controls fact is still a wall of text.

Per area: menu 4.2, Versus picker 4.0, Settings 4.0, Help 4.1 (collapsible, jump bar), Tour map 3.7, Tour splash 4.1, Tour fight 4.0, Versus Hard 3.9, super 4.1, K.O. / round end 4.2, phone 812x375 4.0 (HUD and touch controls clear), phone 390x844 3.7 (picker "More below" fade still covers the hero cards; fight shows a clear "Rotate your device" overlay with Play anyway).
