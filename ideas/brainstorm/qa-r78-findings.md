---
status: idea
added: 2026-11-16
---

# QA r78: findings (main daff5583)

Screenshots in ~/claudetmp/qa-r78/. No console errors in any script run. The worktree had no node_modules, so I symlinked the main checkout's (removed again, not committed). Open r77 items (WEATHER box, WINS WINS, SNAG grey, fullscreen at 568) and the Wispera orb are not re-reported; they are still visible in the shots.

## DMGNUM-1 verification

| Check | Result | Evidence |
|---|---|---|
| Numbers clear of pops, call-outs and each other, live exchanges | VERIFIED at 1280x720, 844x390, 667x375, 568x320. In 15 scripted exchanges (near, far apart, guarded) the probe `arena.fx().numberBoxes` never overlapped another number box. The big number and its small secondary ("16" beside "36", "9" beside "74") sit side by side and read as hit plus bonus, not a collision (r77's "16 tucked under 36" is gone) | dmg-p844-3.png, dmg-d1280-3.png, dmg-p568-3.png, dn-p844-guard-1.png |
| Number vs pop boxes | The probe counted 6 overlaps of a chip number with a pop box in the guarded runs at 844 and 667 (small "1"/"2" numbers under a GUARD-type pop). Screens show nothing unreadable, but the small numbers do touch the pop box edge | dn-p844-guard-0..2.png, dn-p667-guard-0..2.png |
| Wide-view projection (heroes ~850 px apart, camera zoomed out) | Number appeared at the right hero in the shots I got; in 4 of 5 sizes the hits did not land in the sampled frames (heroes too far apart for melee), so evidence is thin | dmg2.cjs output; port-fight.png (portrait, wide camera) |
| Zero-damage hits draw no number | VERIFIED. Foe held guard at 844x390: full-block hits left foe HP at 650/690 and no number was drawn. One HP step with no number (tiny chip under 1) is fine | zero-p844-end.png |
| e2e | New DMGNUM-1 cases at 1280 and 844 pass | see scorecard |

Sampling note: in manual stepping a number stays on screen while no real time passes, so fx().numbers stays non-empty for dozens of samples; that is a test-mode artefact, not a bug.

## New findings

1. Portrait phone (390x844), behind "Play anyway": the arena shrinks to a ~390x215 strip in the middle of black, and the action bar wraps into two rows, the second row (Gale, Cleanse) laid over the lower part of the arena. The foe status chips (DANCE, NO SNAG, STUN, EMBER) stack four deep down the right side over the arena. Damage numbers and hit counter still show. It is playable but the heroes are covered; the rotate prompt is the right call, but "Play anyway" is a poor fallback. Evidence: port-fight.png. Idea: in portrait, single-row bar (scroll or smaller) and cap chips at two.
2. Portrait: the "Play anyway" control is not exposed as a role=button (Playwright `getByRole('button', {name: 'Play anyway'})` finds nothing; `getByText` works). Accessibility smell: screen readers and keyboard users may not reach it. Evidence: port.cjs run.
3. Help at 568x320: the "Jump to" chip row is clipped at the right edge ("Reading the ar"), with no visible scroll cue. Minor. Evidence: help-p568.png.
4. At 844 and 667 the first-run card ("Stick moves you...") still sits over the left of the arena near the live exchange (already noted in r77); with DMGNUM-1 it no longer collides with numbers in the shots I took.

## Menu / Help / Settings

Main menu (Play, Versus, Online, Settings, Help) correct at 1280, 844, 667, 568 and portrait; no mode words shown. Help (Key Bindings, Guide, Wiki, Watch the story, About, jump chips) and Settings (Difficulty, Garrison Sort Order, Save/Back) render at all sizes with scrollWidth equal to clientWidth (no horizontal overflow). Versus, Play and Online also open from the menu at every size. Evidence: menu-*.png, help-*.png, settings-*.png.
