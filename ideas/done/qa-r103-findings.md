---
status: done
triaged: obsolete (r103 snapshot: P1 and most P2/P3 are phone/portrait work, dropped 2026-11-18; remaining desktop polish items 4-7, 10, 11 are cosmetic and superseded by later QA rounds)
added: 2026-11-17
---

# QA r103 findings

Build: main at 4ab5b904, test mode, headless Chromium (SwiftShader), device scale 2 on phones. Shots in `.scratch/shots103/` of the r103 QA worktree (gitignored). Names: `{scene}-{desk|land|port}.png`, fights `fight-{Fire|Water|Earth|Air}-{vp}-{a|b}.png`.
No console or page errors in any scripted run. E2E subset with 1 worker: 17 passed, 1 failed.

## Verified fixed or fine since r102

- Online screen at 390: heading on one line, one Back, Host and Join buttons large; Host opens inline with three steps, Copy invite link and a QR (`online-port.png`, `online-host-port.png`).
- Menu phone row: the featured Online button is no longer taller than its neighbours (menu-phone-row e2e passes).
- Portrait Strike buttons show ability names ("Flame", "Blast") (`fight-Fire-port-b.png`).
- Tour card reads well at 390: stage ladder with NEXT/LOCKED tags, difficulty, continues dots, team portraits (`tour-card-port.png`).

## P1

1. e2e `tests/e2e/versus-layout.spec.ts:26` fails at 390x844: bottom bar height 174.8 px, limit 168.8 px (20% of 844). Cause visible in `picker-port.png`: the "Play a friend online" link wraps to three lines ("Play a / friend / online") and sits beside Fight! and Back, stretching the bar. Idea: put the link on its own full-width row above or below Fight!/Back, or shorten it to "Play online" with no wrap; keep Fight! and Back on one row.

## P2

2. Portrait arena at 390x844 is still mostly sky (r102 P2 item 1 not fixed): fighters about 45-50 px tall, floor band under a large empty sky (`fight-Fire-port-b.png`, `fight-Water-port-b.png`). Idea: cap sky height or raise camera zoom on tall aspect ratios. Pointers: `src/game/scenes/Arena.ts` camera fit.
3. Portrait 2v2 and Tour bars are two rows over the floor, with bench thumbnails and chips (ADREN, SAFE) crowding under the HUD (`tag-port.png`, `tour-fight-port.png`). Same idea as r102: keep the Tag slots next to the Strike buttons so the bar stays one row.
4. Landscape HUD shows two life formats: player "SINDAROSA ▲ 286" versus foe "547/547" (`fight-Fire-land-b.png`). Idea: use one format for both sides (number only, or current/max).
5. A first-run hint toast ("FIRST BLOOD", with "Got it") covers the lower arena on desktop and the upper sky on portrait while the round has started (`fight-Fire-desk-a.png`, `fight-Fire-port-a.png`). Idea: show it during the intro countdown only, or dock it above the bar and auto-dismiss after a few seconds.
6. Water and Air stages are both blue-grey and look alike at a glance, small in portrait (`fight-Water-desk-a.png`, `fight-Air-desk-a.png`). Idea: give Water a teal tint and keep Air lavender with brighter cloud highlights.

## P3

7. Super cut-in hides the foe on desktop and landscape, so the target is not shown while the band plays (`super-desk.png`). Idea: keep the foe visible, dimmed, on the right.
8. Strike buttons in landscape say only "Strike 1/2" with no ability name (r102 item 5, still open).
9. Tour "Stage 1 of 9 / 3 continues left" chip uses a sans-serif face unlike the serif UI (r102 item 8, still open).
10. Versus picker at desktop: the long explanatory paragraph is cut off by the bottom bar behind a "More below" chip (`picker-desk.png`). Cosmetic.
11. Fiara's phoenix art is soft and low-contrast against the lava stage (`fight-Fire-desk-b.png`). Idea: add a thin dark outline or rim light.

## Not covered (follow up)

- Match-end win and lose cards; hero-by-hero Strike labels; a real two-browser Online connection.

## Checked and fine

- Menu, picker, Help, Online, Tour at 1280x720, 844x390 and 390x844: no horizontal overflow, no banned words.
- All four stages render with distinct floors and hazard labels; super and tag effects trigger and read.
