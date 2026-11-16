---
status: idea
added: 2026-11-16
---

# QA r72: scorecard (main 49b837c6, headless Playwright, screenshots in ~/claudetmp/qa-r72/)

## Scores (0-5, vs Street Fighter / MvC)

| Axis | r71 | r72 | Why |
|---|---|---|---|
| Fun | 3 | 3 | Same loop: hits, combo counters, supers, tag swap and Tour all work; still little visible knockback/hitstop, Wispera is still an orb. |
| Graphics | 3.5 | 3.5 | Treenoc now solid in Water/Air intros; roster grew to 13 (Curomo, Pax, Sindarosa look consistent); Earth round-intro Treenoc still pale with a halo. |
| Readability | 3.5 | 3.5 (up in places) | Floating element tags moved onto the floor (no more "RE x2" clip, off heroes); super band no longer covers fighters; Echo is a translucent ghost on the Air floor; 667x375 buttons still touch the arena. |

## Checks

- Menu: exactly Play, Versus, Online, Settings, Help. PASS (menu.png).
- Play picker with 13 heroes, info cards: PASS (nav-Play.png; "More below" cue still present at 720p).
- 1v1 in Fire, Water, Earth, Air (9 pairings): zero console or page errors. PASS (f-*-intro.png, f-*-fight.png).
- Treenoc round intro: MOSTLY FIXED. Opaque and solid on Water stage (f-treenoc-cyclonius-intro.png), no blocky staircase. On Earth (f-rokcore-treenoc-intro.png) it is still pale grey with a light halo, low contrast against the earth floor.
- Tag swap (2v2): "TAG!" banner, bench portraits with cooldown, Treenoc fully opaque after tag-in (tag-1..3.png). PASS. Fade-in artefact gone.
- Super: name band now sits clear of the fighters (sup-rokcore-2.png top band, sup-fiara-1.png lower band below the caster). Depth step is visible as the caster dipping with a ground ring/diamond marker and a phoenix after-image (sup-fiara-3.png). Looks right.
- Tour arena fight (new): captured (tour-2.png). Stage 1 of 9, 2v2-style team strip with bench portraits, "Stage 1 of 9 / 3 continues left" bottom-left, Sindarosa vs Wispera on Air. PASS. Stage card (tour-1.png) readable.
- Help: renders cleanly at 1280x720 (nav-Help.png).
- Phone 844x390: gutter works, Strike 1/2 and Pause sit in the right gutter and the foe is clear (ph-land-arena1.png). Hint card still overlaps the arena top-left; HUD text small but readable.
- Phone 667x375: Strike buttons overlap the arena edge and sit on top of a "FIRE x2" tag (ph-s667-arena1.png); gutter is narrower than at 844.
- Phone 390x844: Rotate overlay with "Play anyway"; menu fine (ph-port-menu.png); arena behind the overlay unusable until dismissed.
- e2e subset (arena-smoke, app-flow, arcade-tag, arcade-super, hero-picker-layout, phone-layout; E2E_PORT=7951): 24 passed.
