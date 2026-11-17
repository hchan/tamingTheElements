---
status: idea
added: 2026-11-16
---

# QA r87 scorecard

Scores 0-5 against Street Fighter / Marvel vs Capcom. Headless Chromium (SwiftShader), seed 7, manual stepping, main at 0dd24edd (Help copy, Help chips, portrait bar one row). Shots in `.scratch/r87/` (gitignored, per worktree), driven by `.scratch/r87/run.mjs` on a dev server. No console or page errors at any viewport. Banned words (Classic, Arcade, ruleset, Capture) absent from menu, Help, Versus picker and fights at all four sizes. Heroes: Curomo (melee), Sindarosa (ranged), Rokcore foe, Fire arena; 3v3 Sindarosa/Pax/Curomo vs Fiara.

| Area | Fun | Graphics | Readability | Notes |
|---|---|---|---|---|
| Desktop 1280x720 1v1 | 3 | 3.5 | 4 | One row, dimmed Melee for the ranged hero, Life text shown. |
| Portrait 390x844 ranged fight | 2.5 | 3 | 3.5 | 8 tiles in one row, 48x48, no empty row (r86 P2/P3 fixed). Sky void above the crowd still large. |
| Portrait 390x844 melee fight | 2.5 | 3 | 3 | Snag tile makes 9 tiles, so the bar falls back to two rows with Cleanse alone on row 1 (see P1). |
| Portrait 390x844 3v3 | 2.5 | 3 | 3 | 10 tiles, two rows, two orphans on row 1; benched Tag tiles labelled STUN. |
| Portrait 360x640 | 2.5 | 3 | 3.5 | 8 tiles in one row at 45px; the arena fills the screen with no void. |
| Landscape 844x390 | 3 | 3.5 | 3.5 | Bar, Strike circles, Pause clear of each other; HUD readable. |
| Menu | n/a | 4 | 4 | Five entries, no mode words. |
| Versus picker | n/a | 3.5 | 4 | Clean at all sizes. |
| Help 390 | n/a | 3.5 | 3.5 | Chips scroll in one row (r86 P5 fixed); Charge copy matches the dimmed tile (P1 fixed). |
