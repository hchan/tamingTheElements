---
status: idea
added: 2026-11-14
---

# QA r38 smaller desktop findings (1280x720)

- Terrain chips: the r37 collision with TAG! / SINDAROSA IN! is fixed (chips hid under the call in tag-0..2 frames). The chips themselves (FIRE x2, WATER +HP, AIR x2) are still plain pill labels floating at random spots; WATER +HP and AIR x2 are low-contrast pale on the pale stage. Give them a darker plate on water and air stages.
- Earth stage: the turquoise crystal prop sits right at the fighter spawn and overlaps Rokcore; reads as clutter (sheet-a.png row 3 left).
- First-run "FIRST BLOOD" key hint bar with Got it overlaps the lower-left of the arena on every stage; it is dense (one long line of keys).
- Versus picker at 1280 is dense: the 2v2 explanatory paragraph and the ability text push hero cards partly off-screen; "More heroes below" is needed even on desktop.
- Super: the GLACIER CRASH cut-in is strong (dimmed arena, banner, element portrait). The impact burst after it is a thin white fan; make it larger for the payoff.
- In 2v2 after a tag, the incoming hero spawns overlapping the foe in my scripted frames (may be my place() artefact); worth a check that tag-in position is not on top of the opponent.

## Progress
- 2026-11-14: earth crystal at spawn and pale-stage chip contrast fixed (presentation only). `src/game/fx/terrain-props.ts`: a patch whose footprint lies within 200 px of either Arcade start column (fighters' row) draws flat scree instead of a crystal/spire/boulder (`overlapsSpawn`, test `terrain-props.test.ts`). `src/game/fx/terrain-view.ts`: chip plate 0.9 to 0.96 plus a thin dark halo outside the rim so the pill edge stays crisp on water and air. Shots: ~/claudetmp/stage-polish/{before,after}/ (all four stages, `rokcore-earth-seed2.png` shows Rokcore on earth with scree at the spawn side).
- 2026-11-27 (re-check against main, no code change): the remaining items are already closed.
  - Versus picker density: the 2v2 paragraph and "More heroes below" are gone from `src` (git grep finds neither); the picker became the team-select grid (hero-unselect, picker-min-text 14 px floor, picker-bar-reserved-space, Jump to Fight chip).
  - First Blood bar: on a short desktop window the card is one line (`firstRunShortLine`, QA r31), solid backing and 16 px text (c4774366), sits in a low strip above the action bar, leaves for a super, tag call or banner (351e9417); `tests/e2e/first-run-hint.spec.ts` pins it.
  - Super burst: `src/game/fx/super-burst.ts` draws a per-element shape (star, rings, swirl, squares, octagon) with a 260 px reach plus glow (843aa6f30, 241bb7b4d), not a thin white fan.
  - Tag-in on top of the foe: fixed in the sim (fbca1c2a, ed8c875a tag-wall, 618bc045 qa-r125); needs src/core, so nothing to do view-side.
  - Left open: terrain chips are still plain pill labels at random spots (contrast was fixed 2026-11-14); a placement or plate redesign is optional polish. Status stays `idea`.
