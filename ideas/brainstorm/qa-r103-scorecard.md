---
status: idea
added: 2026-11-17
---

# QA r103 scorecard (headless Chromium, SwiftShader, 1280x720, 844x390, 390x844)

Scored 0-5 against Street Fighter / Marvel vs Capcom. Shots: `.scratch/shots103/` in the r103 QA worktree (gitignored).
Build: main at 4ab5b904, `--mode test`, `vite preview` on port 7931. Console and page errors across all scripted runs: none. Banned-word and horizontal-overflow checks: nothing found.
Scope this round: menu, Versus picker, Help, Online (`?ice=none`, nothing connected), 1v1 in all four stages, a super, 2v2 with a tag swap, Tour, at desktop, phone landscape and phone portrait. E2E subset (1 worker): 17 of 18 passed (menu-phone-row, menu-showcase, online-copy-paste, online-leave, online-mobile pass; versus-layout 390x844 fails, see findings P1).

## Overall

| Axis | r101 | r102 | r103 | Note |
| --- | --- | --- | --- | --- |
| Fun | 3.4 | 3.4 | 3.4 | No combat change. The super cut-in and the TAG! call are the best moments; stages differ only by backdrop and hazard label. |
| Graphics | 3.8 | 3.8 | 3.8 | Four stages are distinct. Water and Air are both blue-grey at a glance; fighters are small; Fiara's art is soft. |
| Readability | 4.3 | 4.4 | 4.3 | Menu, Online and Tour cards are very clear. Portrait Versus bar grew past its height budget; landscape HUD shows two different life formats. |

## By area

| Area | Result |
| --- | --- |
| Menu (3 viewports) | Clean, five entries, Online highlighted with its subtitle, version string shown. |
| Help, Online (3 viewports) | Clean; Online Host path shows three numbered steps, Copy invite link and a QR code inline at 390. |
| Versus picker | Good at desktop and landscape. At 390x844 the "Play a friend online" link wraps to three lines and the bottom bar is taller than 20% of the screen (fails the e2e check). |
| 1v1 stages (Fire, Water, Earth, Air) | All render; hazard labels readable. A first-run hint toast covers part of the arena until "Got it". |
| Super | Strong orange band ("HELLFIRE LANCE"), hero portrait, dimmed stage; reads well at all sizes. |
| 2v2 and tag swap | Big "TAG!" call, bench thumbnails with cooldown, buff chips; busy but readable on desktop and landscape. |
| Tour | Card is clear (stage list, difficulty, continues, team). Portrait fight bar is two rows. |
| Landscape 844x390 | Best layout. HUD shows "SINDAROSA ▲ 286" for the player but "547/547" for the foe. |
| Portrait 390x844 | Sky still about 70% of the canvas; fighters small; 2v2 and Tour bars are two rows over the floor. |

## Not done

- Match-end win and lose cards (open since r101).
- Hero-by-hero Strike labels; only Sindarosa's pair was seen.
- No real Online connection (by design this round).
