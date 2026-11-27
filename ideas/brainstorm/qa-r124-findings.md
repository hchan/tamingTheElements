# QA r124 findings

status: idea
added: 2026-11-19

Build: main at da78a9da (`Merge pre-push hook on the tiered gate (WP-TG-B2)`), test-mode build via `tools/ci/e2e-server.ts` on port 7924, headless Chromium with SwiftShader, 1280x720 only.
Screenshots: `.scratch/qa-r124/`, copied to `~/claudetmp/qa-r124/`. Menu, Versus picker (1v1 and 2v2), 1v1 on all four stages (stepped), a live 2v2 with a tag swap, a super and a loss to the results screen, Tour stages 1 and 2 (stage 2 reached by a stepped KO win), Help, Settings, Key Bindings. No console errors in any run.

## r123 findings: status

| r123 item | Status in r124 |
|---|---|
| 1 Help chip layout ragged | Still present (`80-help.png`): chips wrap 2 / 3 / 5 per row, "Jump to" label inline left of row one. First section header is now visible, so the "half off-screen" part is better. |
| 2 Picker "More below" chip overlaps list | Still present (`02-versus.png`, `04-picker-2v2.png`): chip sits on the sticky bar edge and over the intro paragraph, which is cut mid-line ("follows the Weather: call Weather in the, fight to change it"). |
| 3 Key Bindings opens scrolled down | Still present when opened from Settings after scrolling (`82-keybindings.png`: title, intro and Up/Down rows are above the fold, only Back visible). Opened from the Help chip it starts at the top (`83-help-keybindings.png`). |
| 4 Key Bindings vs bar labels | Partly present: the bar shows number keys (9 Super, 7 Dash, 5 Melee/Charge) while the table leads with X for Super and lists alternates. In Tour 3v3 the bar uses 3 and 4 for Tag, so the 5 collision is only in a true 3v3 Versus. |
| 5 Tour carried damage not on card | Not reproduced in this run (stage 2 began at 228/228 after a clean win), but the card still shows no per-hero life (`76-tour-card-2.png`). |
| 6 Super cut-in covers status chips | Still present (`52-super-a.png`): the Titan Slam band sits over the ADREN/SAFE chips and the "2 HITS 122 DMG" combo text. |
| 7 No wind-up cue before the Tour rush | Not re-measured; opening contact in `73-tour1-contact.png` is lively (Rooted, Charge, stun by 2 s). |

Both r122 fixes (picker Life equals HUD life, Tour stage 1 rush) held: Sindarosa 228 in Tour, Fiara 547 in 1v1, 519 in 2v2, same in picker and HUD.

## New findings

### 1. Picker arena choice and hero persist between visits without a cue

status: idea
added: 2026-11-19
severity: low

After picking Air in an earlier run, the next 2v2 picker opened with Air selected and Sindarosa/Pax kept, which is fine, but the first picker view shows "Random" in 1v1 and "Air" in 2v2 with no note that the choice is remembered. Minor; confirm it is intended.

### 2. Tour stage card top block reads well but "Opponent" lists names only

status: idea
added: 2026-11-19
severity: low

`71-tour-card-1.png` and `76-tour-card-2.png` show opponent portraits with element labels, but the "Opponent:" text row repeats the same names without elements and the difficulty diamonds have no label of what Normal changes. Low value text; consider dropping the duplicate row or showing the foe lead's element.

### 3. Settings shows touch-only "On-screen buttons" first on desktop

status: idea
added: 2026-11-19
severity: low

At 1280x720 the Controls section opens with "On-screen buttons: Size / Side" (`81-settings.png`) above Key Bindings, which a keyboard player cannot use. Show Key bindings first on non-touch devices, or collapse the on-screen block.

### 4. Results screen portrait styling mismatch

status: idea
added: 2026-11-19
severity: low

On the 2v2 defeat screen (`54-2v2-results.png`) the player's hero art is a large faded sepia portrait while the foe is a small saturated icon, and the line "Pax (earth) knocked out" has no portrait. The hierarchy reads as a style mismatch rather than a loss emphasis. Use the same portrait size for both sides.

## Feel notes

- Super banner TITAN SLAM / EARTH with the dim and camera punch is still the best moment; the tag flash with "TAG!" plus combo counter (`51-tag-b.png`) is clear and punchy. Tag pop-ins show a damage number 122 that overlaps the "TAG!" text for a beat.
- Four stages are distinct (fire cracked lava, water ice, earth sand, air violet cloud). Fire and water have the clearest hazard marks; earth has only two rocks on a washed-out tan field, so the earth stage reads flatter than the rest (`10-1v1-earth-b.png`).
- Hit weight is still light: no visible hit-stop or shake in the stepped frames (open since r123).
- In stepped 1v1 (300 ticks, no input) the foe did not close in; live play and Tour did (not a bug claim, the stepped harness may pause the AI). The first-run hint ("First blood...") sits low and faint (`10-1v1-fire-b.png`).
- Machine load was 17 to 33 during runs; shots were taken with fixed waits, so this does not affect findings.

## Progress

- 2026-11-26 triage on main 7a301ff6. Already fixed: r123 1 Help chips (grid, help.css qa-r127), r123 2 More-below strip (97bd3ce5), r123 3 Key Bindings scroll (router scrollTo(0,0)), new 3 Settings touch block hidden on desktop (hasTouchScreen), combo text under cut-in (4bce6f61), new 2 duplicate "Opponent:" row (no longer in src), new 4 results portraits (winner large, other side small by design, match-end.css).
- Built: status chips are skipped while the super cut-in band overlaps them (`chipHiddenByCut`, r123 6); test in combo-cut.test.ts.
- Open: r123 4 (bar labels vs bindings table), r123 5 (per-hero life on Tour card), r123 7, new 1 (persisted picker cue; owner call), feel notes (hit-stop, earth stage).
- 2026-11-26 (main 7a2e7d5, r123 4/5 recheck, no code change): r123 4 is closed: `actionKeyLabel` keeps Charge off the shared 5 (Tag 3 owns it) and the Key Bindings table names the bar key when it differs ("Super (bar: 9)", pinned in key-bindings.dom.test.ts; commit 919bcfe2). r123 5 has no premise: `TourRun` (tour-model.ts) stores only seed, heroes, stage, continues and status, so every Tour stage starts every hero at full life; the 12/228 seen in r123 came from the stepped harness, and r124 saw 228/228 on stage 2. A per-hero life row would always read full, so none was built; reopen only if carried damage is ever added to the Tour. Still open: r123 7, new 1 (owner call), feel notes.
