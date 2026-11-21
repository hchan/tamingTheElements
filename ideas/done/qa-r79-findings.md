---
status: done
triaged: superseded (rest fixed or dropped)
added: 2026-11-16
---

# QA r79: findings (main 7cba6fab)

Screenshots in ~/claudetmp/qa-r79/. The worktree had no node_modules; I symlinked the main checkout's and removed it before committing.

## Verification of r77/r78 items

| Item | Result | Evidence |
|---|---|---|
| WINS gap (HUD-POLISH-1) | Fixed at 1280 and 844 (clear gap between the two WINS groups). At 568 the labels still nearly touch ("WINS WINS") | dmg-d1280-3.png, dmg-p844-3.png, dmg-p568-3.png |
| Fullscreen toggle | Fine at 1280 and 844. At 568x320 it sits over the combo block: the counter reads "3 / 66" with "HITS" and "DMG" hidden behind the toggle | dmg-p568-3.png |
| Help chip row at 568 (r78 #3) | Fixed: a chevron cue shows the row scrolls | help-p568.png |
| "Play anyway" not a button (r78 #2) | Fixed: getByRole('button', {name:'Play anyway'}) finds 1 | role.cjs run |
| Portrait fight (r78 #1) | Still open: ~390x215 strip, second action-bar row (Gale, Cleanse) over the arena, four foe chips stacked down the right | port-fight.png |
| Weather chip, SNAG pop | Not seen as defects in these shots | dmg-*.png |

## New findings

1. (FIXED, ideas/done/qa-r79-hud-568.md) 568x320: the fullscreen toggle (top right of the arena) overlaps the hit/damage counter. Suggest moving the counter left or the toggle above the HUD at this size.
2. (FIXED, ideas/done/qa-r79-hud-568.md) 568x320: WINS labels still crowd each other, so the HUD gap fix does not cover the smallest landscape size.
3. Portrait fallback layout unchanged (see above); single-row bar and a two-chip cap remain the suggested fix.

## Menu / Help / Settings

Five entries (Play, Versus, Online, Settings, Help) at 1280, 844, 667, 568 and 390 portrait, no mode words; scrollWidth equals clientWidth everywhere; every entry opens. Version stamp 7cba6fab shown in the menu.

## Gaps

Round-end screen not captured; e2e not run.

## Triage 2026-11-21 (code-checked)

Fixed: WINS gap and fullscreen toggle over the counter at 568 (`ideas/done/qa-r79-hud-568.md`, verified r80); Help chip cue; Play anyway role. Dropped (phone/portrait): portrait fight layout (item 3). Gaps (round-end screen) were covered by later rounds.
Open: none.
