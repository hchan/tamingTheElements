# QA r116 scorecard (desktop 1280x720, Chromium SwiftShader, seed 7)

status: idea
added: 2026-11-19

Build: local main (5fd483f9), `vite build --mode test` preview on port 7931 (7930 held by the smoke router). Scripted with ad-hoc Playwright (`shoot-r116.mjs`, not kept). No page or console errors. Shots in `.scratch/qa-r116/`.

| Area | Fun | Graphics | Readability | vs SF / MvC |
|---|---|---|---|---|
| Menu | 3 | 4 | 5 | clean, five entries, no mode words; version string present |
| Versus picker / hero select | 3 | 3 | 3 | MvC-like roster, still text-dense |
| 1v1 four stages | 3 | 4 | 4 | all four distinct; earth ROCK boulders now clearly visible |
| Tag swap / 2v2 | 3 | 4 | 4 | tag works (TAG! call, IN/BENCH lines, portraits swap); team HUD clear |
| Super | 4 | 4 | 4 | MvC-style band; no longer covers combo text or badges |
| Tour | 3 | 3 | 4 | clean stage card and 9-stage strip |
| Help | 3 | 3 | 3 | chips still wrap to uneven rows, text heavy |

Overall: fun 3, graphics 4, readability 4 out of 5.

Shots: `.scratch/qa-r116/01-menu.png` `02-versus-picker.png` `03-hero-select.png` `04-stage-fire.png` `04-stage-water.png` `04-stage-earth.png` `04-stage-air.png` `05-earth-late.png` `06-2v2-start.png` `08-tag-swap.png` `09-tag-swap-after.png` `10-super-cutin.png` `12-hits-combo.png` `13-super-after-combo.png` `14-tour-pick.png` `15-tour-stage-card.png` `16-help.png`
