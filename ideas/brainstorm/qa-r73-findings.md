---
status: idea
triaged: c (floor chips unmerged; Treenoc Earth art open)
added: 2026-11-16
---

# QA r73: findings (main 8bbac0cc)

Screenshots: ~/claudetmp/qa-r73/ (f-*, sup-d-*, sup-p667-*, sup-p844-*, tag-*, tour-*, nav-*, port-*, menu.png). Scripts: sup2.cjs, fight.cjs, tag.cjs, tour.cjs in the same folder.

## Super band verdict

The SUPER-BAND-1 fix works. In 24 desktop shots, 8 at 667x375 and 8 at 844x390 (near: foes 120 px apart; far: 680 px apart; Fire, Earth, Air, Water casters) the band never covers a head or feet. Near fighters sit just under the band (sup-d-fiara-near-1.png, gap about 20 px); far fighters have the text moved to the free side (sup-d-fiara-far-2.png).

## New or remaining problems

1. First-run hint card overlaps the band at 844x390 (sup-p844-rokcore-near-2.png): the "Stick moves you ... Got it" card sits on the band's portrait chip and the first letters of "MOUNTAIN BREAKER". Low impact (first fight only), but the hint could hide while a super plays.
2. Pause button on phones overlaps the right end of the band at 667x375 and 844x390 (sup-p667-fiara-near-1.png). The band is under the button; the title text is clear.
3. Floor element tags ("WATER +HP", "FIRE x2") clip at the screen edge (left "WATER +HP" cut at x=0 in sup-d-treenoc-far-3.png and f-treenoc-cyclonius-fight.png) and sometimes sit behind a fighter's head ("WATER +HP" under Morblass, Cyclonius). Float them inside the arena bounds and below the sprite.
4. Super name text on the Air stage fades to pale-on-pale as the band fades out (sup-d-cyclonius-near-3.png); readable but low contrast mid-fade.
5. Earth round intro: Treenoc is still pale with a halo (f-rokcore-treenoc-intro.png), same as r72.
6. Portrait 390x844 still shows only the Rotate overlay over an unusable arena (port-arena1.png); "Play anyway" required.
7. Faint debug-looking text "P2 Fire Bomb (arming)" above a bomb in a Fire fight (f-fiara-lavax-fight.png). Fine as a trap label, but looks like a debug string.
8. Wispera remains a plain glowing orb (tour-0 and picker); Echo and Cyclonius icons still similar.

## Not a bug

Super meter reads 0% in band shots because the test script calls setMeter(0,1000) and the super consumes it.

## Triage 2026-11-21 (code-checked)

Fixed: the super band never covers a head or feet (verdict); hint card over the band (`ideas/done/hint-card-waits-for-super-band.md`); the "P2 Fire Bomb (arming)" debug prefix is gone (`src/game/fx/trap-fx.ts:18`, no "P1/P2", qa-r3). Dropped (phone): items 2 and 6. Not a bug: super meter 0% in band shots.
Open (c): floor chips clipped at the view edge or under a head: built but not merged, see `ideas/in-progress/floor-tags-1.md`. Open (low): super name text pale-on-pale while fading on the Air stage (no code check made; needs a screenshot).
Art only, noted: Treenoc pale with a halo on the Earth floor (`src/game/fx/hero-grade.ts` leaves alpha untouched, so it is the sheet art); Wispera orb and Echo/Cyclonius icons (`ideas/brainstorm/qa-r127-tour-foe-scale-wispera.md`).
