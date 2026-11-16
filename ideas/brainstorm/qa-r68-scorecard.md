---
status: idea
added: 2026-11-15
---

# QA r68 scorecard (HEAD 00247ae6, dev server port 7930, headless Chromium SwiftShader)

Coverage: Versus Hard fight (active play, idle probe, real K.O., round pip and ROUND 2), Tour (map card, splash, fight, tag swap and a K.O. tag-in), first-run card, Wispera splash (`?seed=7`). Scores 0-5 versus Street Fighter / Marvel vs Capcom (r67 was 3.9 / 4.2 / 3.9). Screenshots in `~/claudetmp/qa-r68/s/`, scripts in `~/claudetmp/qa-r68/scripts/`. No console or page errors in any run. Tour card, splash and fight were compared within one launch, or with `?seed=` pinned.

- Fun: 3.9 (=). K.O. and round restart are still crisp, but the idle player is still pushed to the left wall (x 480 -> 0, Sindarosa half off screen at x 0-9 with Rokcore touching), so WALL-2 did not fix the visible problem.
- Graphics: 4.3 (+0.1). Tour Controls key chips look clean, the life-bar notches and the red striped chip drain look good, and the Tour tag-in (PAX IN!) reads well; Wispera's portrait is still soft.
- Readability: 4.1 (+0.2). Notches, the "Sindarosa K.O." gap label, the Tag slot WAIT / cooldown text and the first-run card clearing the action bar are all clear improvements; the round pip is bigger but still small.

Per area: Versus Hard 3.8 (wall pin), Tour map 4.2 (chips), Tour splash 4.0, Tour fight 4.2, K.O. / round end 4.3, first-run card 4.0, HUD life bars 4.2.
