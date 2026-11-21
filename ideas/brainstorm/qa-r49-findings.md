---
status: idea
triaged: c (2026-11-21; open items are art only: Wispera/menu matte halo, Tour card portraits, moving Air clouds)
added: 2026-11-15
---

# QA r49 findings (ranked)

HEAD 352bc205 (main), dev server, headless Chromium SwiftShader, 0 page errors in every script. Screenshots under `~/claudetmp/qa-r49/s/`. Scores in qa-r49-scorecard.md. Only new or status-changed items are listed in detail; see r47/r48 for the original wording.

## New or changed this round

1. FIGHT! banner still overlaps the first hit (about tick 100, `st-Fire-hit.png`: "1" damage number glued to "FIGHT!"). Open since r47. Hide it on the first input or after about 0.6 s.
2. Phone landscape (844x390 and 667x375) title still sits on the red dragon wing and the water golem; the golem is now fully in frame (better than r48) but the title overlaps it. Shots: `menu-ph-l.png`, `menu-pl.png`. Move the title above the figures or shrink the side figures.
3. Wispera in the Fire and Water stages still has a hard, pixelated dither halo on its edge (`st-Fire-start.png`, `st-Water-super.png`). Fiara is now clean, so Wispera and Echo are the roughest sprites. Re-matte with a soft feather.
4. Stray "ROUND" text ghosting behind the damage number during the TAG! call (`team2-tag-b.png`, centre). Check whether the round banner fades under the tag call; one overlay should win.
5. Phone first-run hint box ("Got it") sits on the upper left of the arena during the super (`ph-super.png`). Same family as the desktop strip; move off the arena or auto-dismiss after the first action.
6. Play (Tour team) picker: the sticky "Start tour" bar still hides the Earth row, the partner is only visible by scrolling, and a "More heroes below" pill is needed (`page-play.png`). The new Slot 1/2/3 badges and the lead Remove-from-team button are good; reserve space under the bar.
7. 2v2 Versus picker: the sticky Fight bar still covers the partner slot (Echo hidden) and the detail pane shows Sindarosa with "Add to team" while Fiara and Morblass are selected (`team2-picker-set.png`).

## r48 and r47 items: status

- Hero showcase rough edges (r48 #1): still open at desktop (`menu-desk-late.png`): dark dithered contour around the rock and a halo around the golem. Left dragon is still cropped by the viewport edge.
- Phone landscape title collision (r48 #2): still open (item 2 above).
- Entrance animation (r48 #3): not re-measured this round; the 2.5 s frame is static.
- Phone portrait showcase nearly invisible (r48 #4): improved. A single red dragon sits bottom right under the buttons, a shadow dragon behind the logo (`menu-ph-p.png`). Fixed enough; could be larger.
- 2v2 Fight bar covers partner (r48 #5, r47 #2): still open (item 7).
- FIGHT! lingering (r48 #6, r47 #4): still open (item 1).
- Hit feedback generic white asterisk (r48 #7, r47 #3): partly improved. The hit still shows a white burst plus a bold number, but the number now shows on every hit shot (`st-Earth-super.png`: 21, `team2-tag-b.png`: 48, `ph-super.png`: 10). The mark itself is still not elemental.
- Super VFX per element (r48 #8, r47 #1): improved. The super burst is now a tinted star outline (orange for Fire in `st-Water-super.png`, `st-Air-super.png`) and the banner band is element-tinted (orange for PHOENIX RISE, pale for PHANTOM SQUALL and SIREN GALE). The impact core is still a white swirl, but the cinematic now reads per element. Mostly fixed.
- Art consistency (r48 #9): still open. Painted menu and Sindarosa portrait versus blurry sprite portraits on flat purple for Wispera and Echo in the Tour card (`tour-card5.png`); even within one card the three enemies mix a painted portrait and two sprites.
- Air stage as cracked ice (r48 #10): improved. The Air floor is now violet-blue with swirl marks and clearly differs from the cyan Water stage (`st-Air-super.png` versus `st-Water-super.png`); still no moving clouds.
- Online page scrolling (r48 #11): not re-shot in detail this round (`page-online.png` captured).
- Tour card flat purple (r48 #12): partly improved. Stage chips now carry a thumbnail background and CLEARED / NEXT / LOCKED chips; the main card is still flat (`tour-card5.png`).
- Desktop first-run hint overlay (r48 #13, r47 #12): still open (`team2-tag-b.png`, "FIRST BLOOD ... Got it" over the arena bottom).
- Life asymmetry (r48 #14, r47 #8): still present (Echo 438 vs Morblass 375 in 2v2, Wispera 757 vs Fiara 547 in 1v1). Intended per the picker text ("each hero has less life than in 1v1"), but life is not shown per hero in the picker.
- Earth stage flat (r47 #6): fixed. The Earth floor is now a textured olive and ochre map with soft light and boulder shadows (`team2-tag-b.png`, `st-Earth-super.png`).
- Echo faint on Air floor (r47 #5): fixed. Echo is readable against the violet floor with a dark swirl body.
- Roster size (r47 #13): Play picker lists 12 heroes (4 per row, Water, Air, Fire, Earth); 24-hero layout still untested.

## Working well

Menu readability on five viewports (`menu-desk-late.png`, `menu-ph-l.png`, `menu-ph-p.png`), 2v2 tag (TAG! call, bench cards with cooldown, SAFE chip: `team2-tag-b.png`), per-element stage floors (all four, `st-*-start.png`), super banner with element label, Tour ladder with cleared and locked chips, phone match to Victory 2-0, Help page with jump links (`help-ph-l.png`, `page-help.png`).

## Triage 2026-11-21 (code-checked)

Fixed: FIGHT banner overlapping the first hit (`FIGHT_BANNER_TICKS = 30`, `round-announcer.ts:20`; `fightYields` in `banner-lanes.ts:35`); stray ROUND text during TAG (centre-call lanes, `banner-lanes.ts`); picker bar vs partner slot and detail pane (`picker-bar.spec.ts:76,140`); Tour picker More-below pill (`10-picker-layout.css:85`); desktop hint at the tag moment (`TAG_CALL_EVENT`, `first-run-hint.ts:14`); life per hero shown in the picker (`heroLife`, `arcade-versus.ts:40`).
Obsolete: phone landscape title collision and phone hint placement (phone/portrait/touch work was dropped by the owner (2026-11-18)).
Open (c): #3 Wispera dithered halo and showcase matte contour (art, see r46 (b)); Tour card painted portraits (r47 #10); Air floor moving clouds (low).
