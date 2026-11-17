---
status: idea
added: 2026-11-17
---

# QA round 100 scorecard

Build: main 8e09153e. Headless Chromium + SwiftShader, 1280x720, 390x844, 360x640. Shots in `.scratch/shots100/` (gitignored). Details in [qa-r100-findings.md](qa-r100-findings.md).

## Overall (0-5, vs Street Fighter / MvC)

| Axis | r99 | r100 | Note |
|---|---|---|---|
| Fun | 3.4 | 3.4 | No sim change; duels still spaced out, supers and tag land well |
| Graphics | 3.8 | 3.8 | Four stages look good on desktop; portrait still sky heavy |
| Readability | 4.1 | 4.2 | Match-end names clean, Strike circles now named; one label still truncates |

## By area

| Area | Score | Note |
|---|---|---|
| Menu (5 entries) | 4.5 | Clean, no banned words |
| Help | 4.3 | Fine; one chip tight at 360 |
| Hero select / Versus picker | 4.2 | Fine |
| Online screen + Copy/Paste | 4.2 | Copy shows Copied, Paste works, 48 px targets; "Copy link" wraps at 360 |
| 1v1 four stages, desktop | 4.3 | Fire, Water, Earth, Air all distinct; bar readable |
| 1v1 portrait 390/360 | 3.4 | Sky 35-45%; Strike 1 label truncates for 4 heroes |
| Tag swap / 2v2 | 3.8 | Works; fighter clipped at left edge in 390 portrait after swap |
| Super cut-in | 4.4 | Full-width band, no collisions |
| Tour | 4.3 | Card scannable at 360 |
| Round-end banner | 4.3 | K.O./PERFECT and ROUND 2 legible |
| Match-end (P1/P2/draw) | 4.0 | No mid-word wrap; Main Menu below the fold at 360 in P2 card |

## Not done

No real touch device or GPU, no audio, no live online connection. E2E: match-end, online-copy-paste, round-end-panel, round-result-real-fight (20 of 20 passed); second subset portrait-play, tour-card, phone-chips, versus-layout, super-band-portrait, arcade-tag, menu-phone-row (53 of 53 passed).
