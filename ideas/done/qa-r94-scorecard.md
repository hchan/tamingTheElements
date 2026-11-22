---
status: done
added: 2026-11-17
---

# QA r94 scorecard (main b36370b2)

Scores 0-5 against Street Fighter / Marvel vs Capcom feel. Screenshots are under `.scratch/shots/` (gitignored), named `<vp>-<name>.png` with vp = d (1280x720), m390 (390x844, isMobile with touch) or m360 (360x640, isMobile with touch). Match-end shots come from `tests/e2e/match-end.spec.ts` (`match-end-<win|lose>-<1280|390>.png`).
Driven headless (Chromium, SwiftShader), manual-mode stepping, seed 7, preview build of `--mode test` on E2E ports 7920 and 7921. No console or page errors in any run.

| Area | Fun | Graphics | Readability | Notes |
|---|---|---|---|---|
| Menu | n/a | 4 | 4 | Five entries, no mode words. `d-menu.png`, `m390-menu.png` |
| Fight, Fire stage (1v1) | 3.5 | 4 | 4 | `d-fight-Fire.png`, `d-fight-Fire-2.png` |
| Fight, Water stage | 3.5 | 4 | 4 | Ice floor reads clearly, "WATER +HP" pad label. `d-fight-Water.png` |
| Fight, Earth stage | 3.5 | 4 | 4 | `d-fight-Earth.png` |
| Fight, Air stage | 3.5 | 4 | 4 | `d-fight-Air.png` |
| Super (desktop) | 3.5 | 3.5 | 4 | HELLFIRE LANCE band with portrait, still a banner rather than a screen slam. `d-super-a.png`, `d-super-b.png` |
| 2v2 tag and swap | 3.5 | 3.5 | 3.5 | Bench cards and TAG slot read well on desktop; on phone the bar is dense. `d-2v2-a.png`, `d-tag-a.png`, `m390-tag-a.png` |
| World Tour (fight) | 3.5 | 4 | 4 | Team strip, "Stage 1 of 9 / 3 continues left" tag. `d-tour-fight.png`, `d-tour-card.png`, `m390-tour-card.png` |
| Play (hero pick) | n/a | 3.5 | 4 | Slot labels now one line; "Sindarosa" fills the tile edge to edge at 390. `m390-play.png` |
| Versus picker, 390x844 | n/a | 3.5 | 4 | New Options strip is clear and states the current choices. `m390-versus.png`, `m360-versus.png` |
| Help, 390x844 | n/a | 4 | 4 | One pill style for all chips; ragged wrap remains. `m390-help.png` |
| Match end: win | 3.5 | 3.5 | 4.5 | Rounds shown once. `match-end-win-1280.png`, `match-end-win-390.png` |
| Match end: loss | 3 | 3.5 | 4 | Own hero plus foe, DEFEAT readable. `match-end-lose-1280.png`, `match-end-lose-390.png` |
| Phone portrait fight | 3 | 3 | 3.5 | Rotate overlay on entry; afterwards small arena, big touch controls. `m390-fight-0.png`, `m390-fight-2.png`, `m360-fight-2.png` |
| Settings | n/a | 3.5 | 4 | `d-settings.png`, `m390-settings.png` |

Overall: Fun 3.5, Graphics 3.5-4, Readability 4 (SF/MvC would score about 5/5/5 on the same rubric: lacks hit-stop slam on supers, character animation depth and a roster stage per hero).

## e2e subset

One browser job, E2E_PORT 7921: `match-end`, `versus-portrait-grid`, `help-controls`, `first-run-hint-portrait`. 17 passed, 0 failed, 0 flaky (1.0 min).
