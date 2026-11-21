# QA r119 findings (desktop 1280x720, headless, main 0ac72a1c)
status: idea
added: 2026-11-19

Method: test build, Playwright headless Chromium (SwiftShader) at 1280x720, `?manual=1&seed=7`. Fights run with `stepLive` in 50-tick chunks (hit-stop active) and `step` for the tag and super. Screenshots in `.scratch/qa-r119/` (worktree). Mac load was 2-4 (under 10), but only screenshots and tick counts are reported, no timing claims.
Smoke: `e2e ran on: PC (job 20261119-114130-short-d729a3, short lane) -> exit 0` (15 passed). Console/page errors: none in any run.
Banned-word scan (Classic, Arcade, ruleset, Capture) of Menu, Versus, Play/Tour card, Online entry/host/join, Settings, Help, Guide, Wiki, About, Key Bindings: none found. The Story page is canvas-only, not text-scannable.

## r118 open items re-checked

1. Help chip wrap: STILL OPEN. Nine chips wrap 4 / 1 / 4 with "Reading the arena" alone (`07-help-0.png`). Same fix as r118.
2. HUD life vs picker "Life 100": STILL OPEN. Picker says Sindarosa Life 100 (`10-play.png`); HUD shows 297 (Versus 2v2), 228 (Tour stage 1), Pax 591/690 and Echo 675 in 1v1. Show scaled life or label the picker value "base".
3. Super cut-in counter vs FIRE label: PARTLY FIXED. In `2v2-super-a.png` the "3 HITS 42 DMG" counter now sits left of the band, clear of the FIRE label. NEW collision instead: the big damage numbers "29" and "13" are drawn on top of the "HELLFIRE LANCE" title and the "FIRE" sub-label (cut-in is covered at its most important moment). Hide or lower hit numbers while the cut-in band is up.
4. Picker "More below" overlap: STILL OPEN. In `10-play.png` (Tour picker) the chip sits over the "Enter" key tag of Translucent Flame, and the footer cuts the paragraph mid-line. Add bottom padding and put the chip in the footer.
5. Tour stage 1 dead walk: STILL OPEN. In Tour stage 1 (Easy) the foe is at x=1360 at tick 30 and x=1070 at tick 130, and first contact is near tick 330 (6.6 s of walking, foe took no damage, `11-tour-3.png`). Start the foe closer or have the AI close faster on stage 1.
6. Earth arena ROCKFALL label over the far hero: NOT REPRODUCED in 250 ticks (`earth-250.png`: foe fully visible, a boulder sits to its right, no label). Needs a longer run to see the hazard; leave open, low confidence.
7. Tour card wording vs action bar: STILL OPEN. Card lists "1 Strike, 2 Special, C Snag, 3 4 Tag" (`11-tour-0.png`); Sindarosa's bar says Blast, Flame, Tag; Echo's bar shows "Snag" on slot 1 (key 1 and C). The first-fight hint reads "Strike 1, Special 2" while the bar says Blast/Flame. Pick one vocabulary, or show the hero's real ability names on the card.
8. Help phone text: STILL OPEN. "each circle on a phone names its ability" is still in How to fight step 2; Settings still has on-screen button size/side options (`06-settings-0.png`).

## New issues

- N1 (low) The first-fight hint ("FIRST BLOOD ... Got it") sits at the bottom of the arena in 1v1 Earth/Air/Fire fights (`earth-250.png`), faded and low contrast over the floor; it is hard to read and lists keys that differ from the bar.
- N2 (low) Stun lock: in every 1v1 sample (fire, earth, air) the player is STUNned with Run greyed "Can't run: stunned" by tick 250, so a passive player spends most early time stunned (`air-250.png`). Not a bug, but readability of "why can't I act" relies on a small badge at top-left.
- N3 (info) Tag swap works: 2v2 tag at tick 95 shows "TAG!" call, Pax in, Sindarosa on the bench with a 2.7 s timer and "ADREN 3s" buff badge (`tag2-10.png`). When the active hero is stunned (`2v2-fight.png`), slot 3 is greyed "STUN" and the tag cannot fire; fine, but players may read it as a bug. The first scripted tag during a stun did nothing.
- N4 (info) Super works: HELLFIRE LANCE cut-in, band, portrait and name present, Rokcore took 308 -> 164 with combo [4,3]; hit-stop confirmed (damage numbers frozen across steps).
- N5 (info) Online host/join, Settings (scrolls below the first viewport, five screens), Help links (Guide, Wiki, Story, About, Key Bindings) all load and are free of banned words.

## Progress note (item 3, damage numbers over the cut-in)

2026-11-21: render-only fix written, NOT yet run (no node_modules in this worktree, no gate, no screenshot). `src/game/fx/super-view.ts` publishes the band rows under `tte.cutBand` while the cut-in is up (cleared at its end); `src/game/hud/cut-numbers.ts` (`cutNumberFadeOf`) returns 0.12 for a number whose box overlaps those rows; `Hud.ts` multiplies the number alpha by it (+1 import line). Unit test `src/game/hud/cut-numbers.test.ts`. Stays in brainstorm until the gate and a real-game super screenshot confirm it.
