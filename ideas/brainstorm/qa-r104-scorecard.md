---
status: idea
added: 2026-11-17
---

# QA r104 scorecard (headless Chromium, SwiftShader, 1280x720, 844x390, 390x844)

Scored 0-5 against Street Fighter / Marvel vs Capcom. Shots: `.scratch/shots104/` in the r104 QA worktree (gitignored).
Build: main at ce818a5d, `--mode test`, `vite preview` on port 7936. Console and page errors across all scripted runs: none.
Scope: menu, Versus picker, Help, Online (plus the failure screen), 1v1 in Fire/Water/Earth/Air, a super (Curomo, GLACIER CRASH), 2v2 with a tag swap, Tour, at desktop, phone landscape and phone portrait.
E2E subset (1 worker): 40 of 40 passed (menu-phone-row, menu-showcase, versus-layout, hud-text-clear, hud-labels-sf, online-copy-paste, online-leave, online-mobile, smoke) plus the `@smoke` failed-connection test.

## Overall

| Axis | r102 | r103 | r104 | Note |
| --- | --- | --- | --- | --- |
| Fun | 3.4 | 3.4 | 3.4 | No combat change. Super cut-in and TAG! remain the best moments; stages differ by backdrop and hazard label only. |
| Graphics | 3.8 | 3.8 | 3.8 | Stages are distinct (Water now clearly teal-ice, Air lavender). Fighters small in portrait; Fiara soft. |
| Readability | 4.4 | 4.3 | 4.4 | Versus bar fixed, one life format per layout; portrait now has a large empty floor band instead of sky. |

## r103 findings status

| r103 finding | r104 |
| --- | --- |
| P1 Versus bottom bar too tall at 390 | Fixed: bar 73.6 px (limit 168.8); link reads "Play online" on one line; versus-layout passes. |
| P2 portrait mostly sky | Partly fixed: sky cropped to about 35%, but the saved space became an empty floor texture band (about 30% of height) below the fight. |
| P2 two life formats | Fixed: both sides now use the same format per layout (number on phone, "Life cur/max" on desktop, "cur/max" in 2v2 landscape). |
| Online failure screen | Fixed: one message, Host/Join and one Try again, at all three sizes. |
| First-run toast covering arena | Still open. |
| Portrait 2v2/Tour bars two rows | Still open (bench icons under HUD, two-row ability bar). |

## By area

| Area | Result |
| --- | --- |
| Menu (3 viewports) | Clean, five entries. Portrait: "OnlinePlay a friend online" has no gap between title and subtitle. |
| Help, Online | Clean. |
| Versus picker | Good at all sizes; 390 bar is one row. |
| 1v1 stages | All four distinct and readable; hazard labels clear. |
| Super | Strong band and dim. Foe is hidden behind the band on desktop. |
| 2v2 and tag | TAG buttons and bench clear on desktop and landscape; busy on portrait. |
| Tour | Card clear; portrait fight has "Stage 1 of 9" chip in a sans face. |
| Landscape 844x390 | Best layout; toast overlaps the arena top-left. |
| Portrait 390x844 | Fighters about 50 px tall, with an empty band below. |

## Not done

- Match-end win and lose cards; hero-by-hero Strike labels; a real two-browser Online connection.
