---
status: done
added: 2026-11-17
---

# QA r97 scorecard (main 7c500bc5)

Scores 0-5 against Street Fighter / Marvel vs Capcom feel. Screenshots under `.scratch/shots/` (gitignored, QA worktree), named `d-*` (desktop 1280x720), `m390-*` (390x844, isMobile, touch, 2x), `m360-*` (360x640) and `l844-*` (844x390). Fight shots are `<size>-fight-<Fire|Water|Earth|Air>.png` (after "Play anyway in portrait", 95 manual ticks) and `-b.png` (150 live ticks later); also `-help`, `-help-b`, `-versus`, `-versus-opts`, `-2v2`, `-2v2-tag`, `-picker2v2`, `-tour`, `-tour-stage`, `-tour-fight`, `-super-<Water|Air>`; desktop `d-super.png`.
Driven headless (Chromium, SwiftShader), seed 7, preview build of `--mode test` on E2E port 7933. No console or page errors in any run. Stable e2e subset (responsive, portrait-play, first-run-hint, help-controls, picker-bar, versus-layout): 128 passed.

| Area | Fun | Graphics | Readability | Notes |
|---|---|---|---|---|
| Portrait sky band, all four stages (390, 360) | 3 | 3.7 | 4 | Stage-correct palettes (lava, olive, teal, violet). The r96 hard seam is now soft, but a thin full-width hairline remains above the crowd (y~765 Fire, ~730 Earth, ~650 Air at 390; y~400 at 360). 40-45% of the 390 canvas is empty dark sky gradient. |
| Crowd step | - | 3.8 | 4 | Much smoother than r96; no visible brightness jump. |
| Help chip grid | - | 4 | 4.5 | Two even columns, every chip one line, full-width "Controls", pill row for Key Bindings/Guide/Wiki/Watch the story/About. Resolves the r96 P3. |
| Versus Options strip | 3 | 4 | 4 | One line with the triangle state glyph; `aria-expanded` false to true on tap (44 px tall). Label truncates the stage at 390 and 360 ("Rand...", "R..."). |
| Live 1v1 (390) | 3.5 | 3.5 | 4 | HUD, STUN chip, hit counter and damage number readable; Strike buttons and ability bar fine. Tall layout wastes the upper half on sky. |
| Live 1v1 landscape 844x390 | 3.8 | 4 | 4 | Wide arena, crisp HUD, joystick, Strike 1/2, Pause and ability bar all clear of the action. Options strip hidden (h=0) and always expanded, as designed. |
| Desktop 1280x720 fight and super | 4 | 4 | 4 | Hellfire Lance banner reads well; hero art and stage texture good. |
| Live 2v2 (390) | 3 | 3 | 3 | Two-row bar with Tag slots, TAG! call works; HUD portraits and status chips ("ADREN 3s / SAFE") small and floating in empty sky. |
| Tour (390) | 3 | 3.5 | 3.5 | "Stage 1 of 9 / 3 continues left" card clear; Air sky in fight. |
| Phone round-result card, first-run strip | - | - | - | Not captured, see findings "Not done". |

Overall: fun 3.4, graphics 3.7, readability 3.9. The sky seam and both r96 P3 items (Help chips, Options state) are fixed. What remains is a faint hairline, dead sky area in portrait and truncated Options label text.
