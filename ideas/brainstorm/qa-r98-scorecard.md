---
status: idea
added: 2026-11-17
---

# QA r98 scorecard

Build: main 031ba80f (portrait action bar panel fade). Real game, headless Chromium (SwiftShader), desktop 1280x720, phone 390x844 and 360x640 (touch, DPR 2). 24 screenshot scenarios, 0 console or page errors. E2E stable subset: 128 passed. Screenshots: `.scratch/shots98/` (gitignored, per worktree).

## Overall (vs r97: 3.4 / 3.7 / 3.9)

| Fun | Graphics | Readability |
| --- | --- | --- |
| 3.4 (=) | 3.8 (+0.1) | 4.0 (+0.1) |

## By area

| Area | Fun | Graphics | Readability | Notes |
| --- | --- | --- | --- | --- |
| Menu, Help | 3 | 4 | 4 | Unchanged, clean at all sizes. |
| Versus picker | 3 | 4 | 4.5 | Options label now leads with the stage and is not truncated at 390 or 360. "More below" chip has clear space above the Fight bar. r97 P3s fixed. |
| 1v1 Fire, portrait | 3.5 | 4 | 4 | Horizon glow and embers read well, no sky hairline seen. Action bar fades in from the floor edge. |
| 1v1 Water/Earth/Air, portrait | 3.5 | 4 | 4 | Each stage has a distinct sky tint and motes. Two-row ability bar (Water, Air) hides part of the floor. |
| Super cut-in | 4 | 4 | 4 | Full-width banner at 390 and 360 (r97 thin-band P3 appears fixed). At 360 the title "GLACIER CRASH" collides with the "WATER +HP" chip. |
| 2v2 and tag | 3.5 | 4 | 4 | Larger bench portraits and stacked chips fit at 390 and 360, read well. Two-row bar covers the lower floor. |
| Tour | 3 | 3.5 | 3.5 | Stage card at 390 clips the opponent trio portrait and "YOUR TEAM" caption on the right edge. |
| Round end | 3 | 3.5 | 3.5 | Round banner is faint and sits in empty sky; SAFE chips overlap the HUD bar. |
| First-run strip | 3.5 | 4 | 4.5 | Readable, appears after the FIGHT! banner, Got it button reachable. |

## What worked

- Super cut-in is now a full-width banner on phones.
- Options strip label and More-below chip spacing.
- Portrait sky horizon glow, motes, action bar panel fade; no hairline.
- Larger 2v2 portraits with stacked chips.
- Desktop unchanged and clean; no errors anywhere.

## Not done

- Water super was shot at 390 and 360 only via the superFx path with forced meter; Air super at both sizes, not inspected frame by frame.
- No real-device or non-Chromium check; no audio check; no manual long-form play.
