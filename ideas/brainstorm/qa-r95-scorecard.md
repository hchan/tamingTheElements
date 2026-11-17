---
status: idea
added: 2026-11-17
---

# QA r95 scorecard (main 5d3b0227)

Scores 0-5 against Street Fighter / Marvel vs Capcom feel. Screenshots under `.scratch/shots/` (gitignored, QA worktree), named `m390-*` (390x844, isMobile, touch, 2x) and `m360-*` (360x640). Fight shots are `m<w>-fight-<Fire|Water|Air|Earth>.png` (after "Play anyway in portrait", 95 manual ticks) and `-b.png` (150 ticks later); live 1v1 shots are `m390-live-1..4.png`.
Driven headless (Chromium, SwiftShader), seed 7, preview build of `--mode test` on E2E port 7955. No console or page errors in any run.

| Area | Fun | Graphics | Readability | Notes |
|---|---|---|---|---|
| Portrait sky band, Fire (390, 360) | n/a | 2.5 | 3.5 | Haze under the crowd reads as stage; top ~third of the sky is still lava art with a hard edge. `m390-fight-Fire.png`, `m360-fight-Fire.png` |
| Portrait sky band, Water | n/a | 2 | 3.5 | Teal haze, then a brown-black lava strip above it: wrong element. `m390-fight-Water.png`, `m360-fight-Water.png` |
| Portrait sky band, Air | n/a | 2 | 3.5 | Violet haze under, lava strip above. `m390-fight-Air.png`, `m360-fight-Air-b.png` |
| Portrait sky band, Earth | n/a | 2.5 | 3.5 | Olive haze, lava strip above; a mid-grey gradient between. `m390-fight-Earth.png`, `m390-live-2.png` |
| Versus picker + Options strip, 390 and 360 | n/a | 3.5 | 4 | Strip present, two-line wrap, unchanged from r94. `m390-versus.png`, `m360-versus.png` |
| Play pick, 390 | n/a | 3.5 | 4 | `m390-play.png` |
| 1v1 live play-through (portrait, Earth) | 3 | 3 | 3.5 | Strikes and Rockfall land, stun and weather chips show; sky and KO banner crowd the HUD. `m390-live-1..4.png` |

Overall: Fun 3, Graphics 3 (sky band drags it down), Readability 3.5-4.

The new sky fill does not yet deliver "mirrored stage art on all four stages": see qa-r95-findings.md P1.
