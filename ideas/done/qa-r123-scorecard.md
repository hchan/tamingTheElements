# QA r123 scorecard

status: done
added: 2026-11-19

Build: main at 602f205d, headless Chromium with SwiftShader, 1280x720, live keyboard input for one full 1v1, one full 2v2 and a four-stage Tour walk; stepped play for the stage sweep and the tag and super frames.
Screenshots: `.scratch/qa-r123/`, key ones in `~/claudetmp/qa-r123/`.

## Covered

Menu (`01`), Versus picker 1v1 and 2v2 (`02`, `04`), 1v1 on all four stages (`10`), live Fiara vs Lavax match (`40`), tag swap (`51`, `60`), super cut-in (`52`, `62`), live 2v2 to results (`53`), Tour cards and fights 1 to 4 (`71` to `75`), Help (`80`), Settings (`81`), Key Bindings (`82`).
Smoke: `e2e ran on: PC (job 20261119-154452-short-c43049, short lane) -> exit 0` (15 passed).
Console errors across all runs: none.

## Checks of the r122 changes

- Picker Life matches HUD life (Sindarosa 228, Pax 591, Fiara 519/547): fixed.
- Tour stage 1 rush: foe closes 599 to 232 px about 0.7 s after "Fight!": fixed.
- Still open: Help chip layout, picker "More below" chip, super cut-in vs chips.

## Scores (0-5, vs Street Fighter / MvC)

| Area | Fun | Graphics | Readability | Note |
|---|---|---|---|---|
| 1v1 arenas | 3 | 4 | 4 | Stages and ability bar good; hits lack weight (no visible hit-stop or shake) |
| Tag / super | 4 | 4 | 3 | Super banner is the highlight; chips under it still inconsistent |
| 2v2 and results | 3 | 4 | 4 | Results clear, Rematch focused |
| Tour | 3 | 4 | 4 | Stage 1 now opens with contact; carried damage not shown on the card |
| Menus, Help, Settings | n/a | 3 | 3 | Help chips ragged; Key Bindings opens scrolled down |
triaged: 2026-11-21 closed as obsolete; scorecard table duplicates qa-r123 findings.
