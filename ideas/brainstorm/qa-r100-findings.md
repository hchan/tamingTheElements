---
status: idea
added: 2026-11-17
---

# QA round 100 findings

Build: main 8e09153e. Headless Chromium + SwiftShader at 1280x720, 390x844 and 360x640. Shots are in `.scratch/shots100/` (gitignored, in the QA worktree `agent-a2325979261972223`). 0 console or page errors across menu, picker, 4 stages, 2v2, tag, super, Tour, Help, Online, match end and round end.

## P2

1. **Strike 1 circle still truncates long ability names with an ellipsis (recheck of the r99 change).** The name fits for most heroes but is 3 px too wide for the 54 px label box on: Cyclonius "Wind Cone", Ishimi "Slime Ring", Pax "Adrenaline" (renders "Adrenal..."), Rokcore ("Rock Armr", already an abbreviation, shows "Rock Ar..."). Same at 390 and 360 (scrollWidth 57-58 vs clientWidth 54). Strike 2 circles are all fine. Fix: shorten the font by one step for names longer than 8 characters, or widen the label box about 6 px. Shots: `.scratch/shots100/strike-pax-p360.png`, `strike-ishimi-p360.png`, `fight-Air-p360-b-mid.png`, `round-3-p390.png` ("Wind Co...").
2. **Pax is clipped by the left screen edge after a tag swap in 2v2 portrait (390).** The active fighter sits half off-screen during the super and after the swap, while the action bar covers the floor below. Shots: `.scratch/shots100/2v2-super-early-p390.png`, `2v2-tagged-p390.png`.
3. **Portrait still spends 35-45% of the screen on sky, and the round-2 intro camera is zoomed out further** (fighters tiny at the edges, floor a thin strip). Shot: `.scratch/shots100/round-4-p390.png` (ROUND 2 intro), `fight-Water-p390-c-hit.png`.
4. **Two-row ability bar covers the lower floor at 360x640 in 2v2 and Tour** (fighters on the lower floor hide behind it). Shots: `.scratch/shots100/2v2-start-p360.png`, `tour-fight-p390.png`.

## P3

5. **Match-end card at 360x640 pushes Main Menu below the fold** in the local P2 Winner card (needs scroll; Rematch and Change fighters visible). Shot: `.scratch/shots100/me/match-end-local-p2-360.png`. Names do not wrap mid-word (checked P1, P2, draw, win, lose at all three sizes).
6. **Online "Copy link" label wraps to two lines at 360** beside the Copied button (the button stays 48 px tall and readable). Shot: `.scratch/online/copy-360.png`. Copy shows "Copied", Paste fills the box (spec passes).
7. **Draw card shows "DRAW" twice** (ribbon and the heading chip). Shot: `.scratch/shots100/me/match-end-draw-390.png`.
8. **Help "Choosing your heroes" jump chip runs to the right edge at 360.** Shot: `.scratch/shots100/help-p360.png`.
9. **Online page background gradient ends about one viewport down on a tall full-page capture** (dragon art stops at y=640, flat colour below). Shot: `.scratch/shots100/online-p360.png`. May only be a fullPage capture artefact.

## Checked and fine

- Menu has exactly Play, Versus, Online, Settings, Help; no banned words.
- Round-end K.O. / PERFECT and ROUND 2 name banners read at 390 and 360.
- Match-end P1/P2 winner ribbons, Victory, Defeat and Draw cards.
- Online Copy / Paste buttons: 48 px minimum, no horizontal overflow at 360 and 390.
- Super cut-in band (Titan Slam, Earth) full width at 390, no overlap with SAFE chip.
