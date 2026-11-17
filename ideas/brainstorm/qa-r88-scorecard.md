---
status: idea
added: 2026-11-16
---

# QA r88 scorecard

Scores 0-5 against Street Fighter / Marvel vs Capcom. Headless Chromium (SwiftShader), seed 7, manual stepping, main at 38723182 (portrait bar balanced rows for 9-10 tiles, one-row bar for ranged heroes). Shots in `.scratch/r88/` (gitignored, per worktree), driven by `.scratch/r88/run.mjs` on a dev server. No console or page errors at any of the nine runs. Heroes: Curomo (melee) vs Rokcore, Sindarosa (ranged) vs Rokcore, 3v3 Sindarosa/Pax/Curomo vs Fiara; Fire arena for the ranged runs. Menu, Help and the picker were not re-read this round (r87 clean, not touched since).

| Area | Fun | Graphics | Readability | Notes |
|---|---|---|---|---|
| Desktop 1280x720 1v1 melee | 3 | 3.5 | 4 | 10 tiles in one row, Life x/y shown. |
| Desktop 1280x720 3v3 | 3 | 3.5 | 4 | 13 tiles one row, Blast and Flame present, benched Tag tiles read WAIT. |
| Portrait 390x844 melee | 2.5 | 3 | 4 | 5+4 centred, 64px tiles (r87 P1 fixed). Ice Shock missing (P1). Void above the crowd (P2). |
| Portrait 390x844 ranged | 2.5 | 3 | 3.5 | One row, 48px, no empty row. Void is the largest of the three (about 45% of the canvas). |
| Portrait 390x844 3v3 | 2.5 | 3 | 3.5 | 5+5 at 64px, orphans gone (r87 P1 fixed). Tag tiles read WAIT (r87 P4 fixed). |
| Portrait 360x640 melee / 3v3 | 2.5 | 3 | 3.5 | 5+4 and 5+5 at 64px; arena is short, about 330px tall, no void. |
| Portrait 360x640 ranged | 2.5 | 3 | 3.5 | One row, 45px wide tiles. |
| Touch targets | n/a | n/a | 4 | Tiles at least 45px, Strike circles about 64px, Pause 44px+ and clear of the canvas. |
| HUD text, portrait | n/a | 3 | 3 | Left side drops "Life" and, for melee, the max; super label differs between heroes (P3). |
