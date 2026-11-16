---
status: idea
added: 2026-11-15
---

# QA r69: scorecard (HUD follow-ups, WP-HF1)

Build: main 31cf781c, test-mode build, headless Chromium (SwiftShader), 1280x720, 390x844, 844x390. Shots in ~/claudetmp/qa-r69/ (menu-*, picker-*, stage-{Fire,Water,Earth,Air}-{intro,fight}, 2v2-start, tag-swap-t{0,3,11}, flash-t{0,1,2,3,6,12,25}, ko-pax-in-t{1,7}, super-cutin(2), super-impact, round-banner-t5/t45, fight-banner, aura-top-{Fire,Air}, phone-*, tour-*, help-*). No console or page errors in any capture.

## Scores (0 to 5 vs Street Fighter / Marvel vs Capcom)

- Fun 3: tag, super and 2v2 all work and read as a tag fighter; opening seconds are still passive and the default matchup is lopsided (Sindarosa 286 HP vs Fiara 547 in the aura shot).
- Graphics 3.5: stage art, stands and super cut-in (blue GLACIER CRASH band, speed lines, zoom) are strong; fire aura glyphs (floating orange triangles) look odd; hero names slide in faint.
- Readability 3.5: HUD is clean (equal bars, numeric HP, super pips, TAG chip), TAG! and ROUND banners are now legible; name and damage number overlaps remain.

## HF1 fixes judged

- Swap flash on life bar: subtle, the bar goes pale for a few ticks (flash-t1/t2) then settles by t12. Reads as a flash but is easy to mistake for a dimmed state. 3/5.
- TAG! call placement: clear above the head and combo, bone white, large at 2x (flash-t1); gone for about 15 view ticks while FIGHT! is up. 4/5.
- PAX IN! / SINDAROSA IN! call: huge, hugs the left edge (x 16 to 424) and overlaps the damage number "30". 2.5/5.
- ROUND banner contrast: bone on a dark feathered band, readable on all four stages. 4.5/5.
- Picker "More below" tab: small, on the top edge of the bar, legible on phone. 4/5.
- Equal-length life bars: fine, the numeric label carries the HP difference. 4/5 (a very low-HP fighter looks as healthy as a full one at a glance; check bar fill, not length, is the signal).
- Aura ghost above the crowd wall: aura-top-Fire and aura-top-Air show no ghost with a hero parked at the top of the arena. 4/5 (jump arc not captured, sim has no jump).

## e2e (corepack pnpm e2e subset + focus specs x3)

Stable subset: 48/48. Focus specs (hit-mark-element, responsive, versus-stage-pick, idle-aura): run 1 3 failed, run 2 4 failed, run 3 3 failed. See qa-r69-findings.md for the classification.
