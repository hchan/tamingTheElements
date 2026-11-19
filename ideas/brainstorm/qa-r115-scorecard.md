# QA r115 scorecard (desktop 1280x720, Chromium SwiftShader, seed 7)

status: idea
added: 2026-11-18

Note: tools/qa/playthrough.ts does not exist in this tree; shots were taken with ad-hoc Playwright scripts (.scratch/qa-r115/shoot.mjs, shoot2.mjs) against a `vite build --mode test` preview on port 7950.

| Area | Fun | Graphics | Readability | vs SF / MvC |
|---|---|---|---|---|
| Menu | 3 | 4 | 5 | clean, strong dragons; Online highlighted gold looks like a permanent hover |
| Versus picker | 3 | 3 | 3 | MvC-like roster grid, but dense text block and sticky footer cut copy |
| 1v1 four stages | 3 | 4 | 4 | stages are distinct and attractive; fights are slow and static |
| Tag swap / 2v2 | 3 | 4 | 3 | team HUD clear; swap not demonstrated in my run (see findings) |
| Super | 4 | 4 | 3 | cut-in band is MvC-grade, but overlaps combo text |
| Tour | 3 | 3 | 4 | clear team pick, lots of text |
| Help | 3 | 3 | 3 | chip wrap uneven, text-heavy |

Overall: fun 3, graphics 4, readability 3.5 out of 5.

Shots: .scratch/qa-r115/01-menu.png 02-versus-picker.png 04-stage-fire.png 06-stage-air.png 07-stage-water.png 08-stage-earth.png 13-2v2-exchange.png 14-tag-in-5.png 16-super-freeze.png 17-super-mid.png 20-tour-1.png 30-help.png
