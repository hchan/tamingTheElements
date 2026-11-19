# QA r113 findings

Build: main at c9ff2bad. Screenshots live under `.scratch/qa-r113/` (viewports `desk` 1280x720, `p390` 390x844, `p360` 360x640, `land` 844x390). Scores are in `qa-r113-scorecard.md`.
Each entry below is its own idea.

## 1. Portrait menu: Settings and Help rows still misaligned

status: idea
added: 2026-11-18
severity: medium

The phone-row alignment fix did not fully land in portrait. The Settings and Help rows differ in height and top edge, and the Play underline and the gold Online button make the list read as uneven.
Screenshots: `.scratch/qa-r113/p390-menu.png`, `.scratch/qa-r113/p360-menu.png`.
Idea: give all five rows one min-height and one baseline; drop the underline on Play or put it on every row; tone Online down to match the rest.

## 2. Portrait fight: empty sky, tiny fighters

status: idea
added: 2026-11-18
severity: high

At 390x844 about 40 percent of the screen above the arena is empty sky and the fighters are small, so the fight is hard to read (SF on a phone zooms to the fighters).
Screenshots: `.scratch/qa-r113/p390-fight-fire.png`, `-fight-water.png`, `-fight-earth.png`, `-fight-air.png`.
Idea: in portrait, crop or zoom the camera so the fighters fill at least a third of the height; push the HUD to the freed space.

## 3. 360x640: fighter name truncates

status: idea
added: 2026-11-18
severity: low

The larger portrait HUD text now clips a name ("SINDA...") at 360 wide.
Screenshots: `.scratch/qa-r113/p360-fight-fire.png`, `.scratch/qa-r113/p360-2v2.png`.
Idea: shrink-to-fit the name (or use short names) when the available width is under the text width.

## 4. Tag labels and timers are tiny (about 7 px)

status: idea
added: 2026-11-18
severity: medium

The bench portraits and TAG timers in 2v2 are about 7 px in portrait and landscape, unreadable on a phone and not part of the HUD text enlargement.
Screenshots: `.scratch/qa-r113/p390-tagswap.png`, `.scratch/qa-r113/land-tagswap.png`, `.scratch/qa-r113/p390-2v2.png`.
Idea: apply the portrait HUD scale to the bench strip; at least 11 px.

## 5. Portrait super: caster cut off

status: idea
added: 2026-11-18
severity: medium

The super cut-in band is the best moment on desktop, but in portrait the caster art is partly cropped by the narrow viewport.
Screenshots: `.scratch/qa-r113/p390-super.png` vs `.scratch/qa-r113/desk-super.png`.
Idea: anchor the cut-in art by its face centre and scale to the viewport width.

## 6. Rotate overlay blocks first portrait play

status: idea
added: 2026-11-18
severity: low

Entering a fight in portrait shows "Rotate your device ... Play anyway in portrait" first; players must tap again. Remember the choice for the session, or skip it when the portrait layout is supported.
Screenshots: `.scratch/qa-r113/p390-fight-fire.png` (after the tap; the overlay was seen before it).

## 7. Versus picker: header clip and lowercase labels

status: idea
added: 2026-11-18
severity: low

The Versus hero picker header is clipped on phones, and role/element labels are lowercase and dense compared with the menu's styling.
Screenshots: `.scratch/qa-r113/p390-2v2-picker.png`, `.scratch/qa-r113/p360-2v2-picker.png`, `.scratch/qa-r113/p390-select.png`.
Idea: title-case the labels, allow the header to wrap, and give the select a visual hero grid like SF.

## 8. Tour tiles clipped behind the pinned FIGHT

status: idea
added: 2026-11-18
severity: low

With FIGHT pinned at the bottom, the last tour tiles are partly hidden behind it unless scrolled; add bottom padding equal to the button height.
Screenshots: `.scratch/qa-r113/p390-tour-card.png`, `.scratch/qa-r113/p360-tour-card.png`.

## 9. Landscape phone: first-run card covers the arena

status: idea
added: 2026-11-18
severity: low

At 844x390 the first-run card covers the left of the arena and the Pause and Strike buttons sit outside the canvas on the right.
Screenshot: `.scratch/qa-r113/land-fight-fire.png`.
Idea: auto-dismiss the card on first input and keep controls inside the safe area.

## 10. Gamepad Run button not exercised

status: idea
added: 2026-11-18
severity: info

Only verified in `src/ui/screens/help-controls.ts` (Home, "Run Away / Run Towards") and its pad-binding unit test; no pad was attached in headless QA. Add an e2e that injects a pad state.

## Smoke result

`pnpm e2e:smoke`: NOT RUN to completion. The router waited on "PC busy (load)" (load 11.0, 1 GPU job, full lane busy; the short lane idle) for over 5 minutes while other agents' e2e runs held the queue. No "e2e ran on:" line was produced, and no exit code. I did not force the Mac and did not rerun elsewhere. Log: `.scratch-smoke.log` in the worktree root. Re-run when `pnpm pc:probe` shows the PC free.
