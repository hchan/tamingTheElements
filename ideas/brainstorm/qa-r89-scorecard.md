---
status: idea
added: 2026-11-16
---

# QA r89 scorecard

Scores 0-5 against Street Fighter / Marvel vs Capcom. Headless Chromium (SwiftShader), seed 7, dev server, main at 4dbe7bfe (Help links compact, portrait HUD text consistent). Shots in `.scratch/r89/` (gitignored), drivers `run.mjs`, `play.mjs`, `hold.mjs`, `super.mjs`, `menu.mjs` there. No console or page errors in any run. Heroes: Curomo (melee) and Sindarosa (ranged) vs Rokcore, Pax vs Fiara (start only). Touch input driven with CDP touch events held across stepLive ticks (a plain tap between manual steps is never seen by the sim, which is a harness artifact, not a bug).

| Area | Fun | Graphics | Readability | Notes |
|---|---|---|---|---|
| Menu 390 / 360 / 1280 | n/a | 3.5 | 4.5 | Five entries, 57/50/58 px tall, no overflow. |
| Help 390 / 360 | n/a | 3.5 | 4 | Page links 2 rows at 390, 3 at 360 (fix verified); label text sits top-aligned in the buttons (P5). |
| Versus picker 360x640 | n/a | 3 | 3 | Sticky Fight/Back footer takes about 41% of the screen; options far below the hero grid (P2). |
| Portrait 390x844 melee | 3 | 3.5 | 4 | HUD "CUROMO ● 542 SUPER 0%", 5+4 tiles at 64px. |
| Portrait 390x844 ranged | 3 | 3.5 | 3.5 | One row of 48x92 tiles, HUD name truncated "SINDA…" (P1). |
| Portrait 360x640 melee / ranged | 3 | 3.5 | 3.5 | Same text, name "SINDAR…" truncated; 45px tiles. |
| Desktop 1280x720 | 3 | 3.5 | 4 | "Life 542/542" and "SUPER 0%" unchanged. |
| Touch input (Strike, tiles) | 3 | n/a | 4 | Strike 2 hit, Strike 1 produced nothing during the ROUND 1 intro (expected); tiles fire. |
| Super cut-in | 3.5 | 4 | 4 | Band sits under the HUD, fills the sky; works for melee and ranged at both sizes. |
| Long fight (about 1500 ticks) | 3 | 3 | 3 | Overlapping damage numbers, huge combo digits cover the fighters (P3). |
