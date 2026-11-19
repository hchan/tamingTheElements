# QA r125 scorecard

status: idea
added: 2026-11-19

Build: main at f523842e, production build exit 0, dev server in test mode, headless Chromium with SwiftShader at 1280x720 and 1920x1080 (phone 390x844 screenshots only). Screenshots: /Users/henry.chan/tamingTheElements/.claude/worktrees/agent-a77c3dce6b1857aa7/.scratch/qa-r125/

Scores are 0-5 versus Street Fighter / Marvel vs Capcom.

| Area | Fun | Graphics | Readability |
|---|---|---|---|
| 1v1 arenas (fire, water, air, earth) | 3 | 4 | 4 |
| Tag swap and super | 4 | 4 | 3 |
| 2v2 | 3 | 4 | 4 |
| Tour | 3 | 4 | 4 |
| Menus, Help, Settings | n/a | 3-4 | 3-4 |

Covered: menu (1280, 1920, 390), Versus picker incl. 2v2, 1v1 in all four stages at both desktop sizes, 2v2 fight, tag swap, super (4/14/30 ticks), Tour setup, card and fight, Help, Settings.

Banned words (Classic, Arcade, ruleset, Capture) seen: none. Console errors: none.

e2e ran on: nowhere -> exit 130. `e2e:smoke` never ran: the router reported "PC busy (load)" for the whole 580 s window and my timeout stopped it. No Mac fallback was forced. Smoke is unverified this round (log: .scratch/qa-r125/smoke.log).

New findings: qa-r125-super-cutin-covers-combo, qa-r125-first-blood-hint-tiny-1920, qa-r125-life-disparity-heroes, qa-r125-tag-sprite-overlap. Still open from r123 and not re-filed: ragged Help chips, picker "More below" overlap, Key Bindings opens scrolled, key label mismatch, Tour card lacks carried damage, no hit-stop or shake, no wind-up telegraph.
