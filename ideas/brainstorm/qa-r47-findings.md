---
status: idea
triaged: c (2026-11-21; all fixed or obsolete except Tour card portraits on flat purple, art)
added: 2026-11-15
---

# QA r47 findings (ranked)

Screenshots under `~/claudetmp/qa-r47/s/`. See qa-r47-scorecard.md for scores.

1. Super starburst is generic and not elemental. Every super hit (all four stages) shows the same white vector asterisk, which reads cartoony against the mystic goal. Use per-element painted bursts (embers, shards, wind ribbons, dust and stone). Shots: `sup-Fire-grid.png`, `sup-Water-grid.png`, `sup-Air-grid.png`, `sup-Earth-grid.png`.
2. Sticky Fight bar covers content in the picker. At 1280x720 it hides the partner slot (Pax is invisible after selection) and the hero grid under a "More heroes below" pill. On phone it cuts the first hero row. Make the bar not overlap (reserve space) or show the selected partner in the bar. Shots: `team2-picker-set.png`, `ph-pick-a.png`.
3. Hit feedback is still uneven. On phone, strikes show STUN and a spark but no damage number. Make every confirmed hit show a number and a contact mark. Shot: `ph-hit9.png`.
4. FIGHT! banner lingers into combat (still visible about tick 110 on desktop and phone). Shorten it so it does not cover the first hits. Shots: `team2-hit.png`, `ph-hit9.png`.
5. Echo is faint on the pale Air floor and the Air super burst washes out. Add an outline or rim light and a darker floor under the fighters. Shot: `sup-Air-grid.png`.
6. Earth stage is flat beige-green with vector boulders. Repaint with texture and shadow. Shots: `sup-Earth-grid.png`, `ph-super.png`.
7. Fighter sprite quality: Fiara has a crunchy orange outline and Ishimi is dark and low contrast on Water. Shots: `sup-Water-grid.png`, `team2-fight0.png`.
8. 2v2 setup is asymmetric (Sindarosa life 213/213 vs Fiara 383/383). Check that partner pairing and life scaling are intended and shown in the picker. Shot: `team2-tag-a.png`.
9. Online page is plain: unframed large labels over a dragon backdrop, host and join sections stack and need scrolling. Put each in a framed card, show steps 1-2-3. Shot: `online-1.png`.
10. Tour stage card portraits are low-res and blurry on flat purple, while the Tour splash art is the best in the game. Reuse the painted splash style for the card. Shots: `tour-card1.png`, `tour-splash.png`, `tour-grid.png`.
11. Tour picker has the same "More heroes below" bar covering the Earth row. Shot: `tour-pick.png`.
12. Desktop first-run hint strip ("Got it") overlays the bottom of the arena at the tag moment. Move it off the arena or auto-dismiss. Shot: `team2-tag-a.png`.
13. Roster is still 12 heroes, so the 24-hero layout is untested. Re-check when it lands.

Working well: tag swap presentation (`team2-tag-a.png`, `team3-tag-b.png`), super banners with element label and "2 HITS 110 DMG" (`sup-Fire-grid.png`), phone controls and Victory screen (`ph-start.png`, `ph-result.png`), 3v3 bench portraits and Tag buttons.

## Triage 2026-11-21 (code-checked)

Fixed: per-element super burst (`BURST_SHAPE`/`BURST_COLOR`, `src/game/fx/super-burst.ts:10`); picker bar vs partner slot and detail pane (`tests/e2e/picker-bar.spec.ts:76,140`, More-below pill in the bar `10-picker-layout.css:85`); hit numbers on every hit and per-element marks (`hit-mark.ts`); FIGHT banner 0.6 s (`FIGHT_BANNER_TICKS = 30`, `src/game/hud/round-announcer.ts:20`); Echo on Air and Earth floor (verified r49); Fiara outline (clean by r49); Online page rebuilt (`online-quick.ts`); desktop first-run hint leaves on tag/super/round end (`first-run-hint.ts:12-18`).
Intended: life asymmetry in 2v2 (picker text and hero panel show the team-size life, `arcade-versus.ts:766`). Not reproduced: Ishimi dark on Water (subjective, no later report). Phone parts obsolete (phone/portrait/touch work was dropped by the owner (2026-11-18)).
Roster: 24 heroes now (see r46).
Open (c): #10 Tour stage card portraits blurry on flat purple vs the painted splash (art; `ideas/done/qa-r4-tour-card-art-mismatch.md` only brightened the card; art-director gate).
