---
status: done
triaged: superseded (portrait items fixed or dropped; rest fixed)
added: 2026-11-16
---

# QA r82: findings (main d96baa44)

Screenshots in .scratch/r82/shots/ of the QA worktree (agent-a1d0e4bcecc9cf60a): p390/p360/p768 with suffixes -rotate, -intro, -fight260 (260 ticks past FIGHT!), -card, -fight-clean (after "Got it"), -super, -chips; l844/l568/l1280 with the same suffixes; stage-fire/water/earth/air(+3 for seed 3); floor-fire/water/earth/air.png (Classic demo floors); menu-1280/390, Help-*, Play-*, Versus-*. Scripts: .scratch/r82/shoot.cjs, floors.cjs.

## Portrait verification (P1, P3, P4)

| Item | Result |
|---|---|
| Canvas pinned under 52 px strip | Pass. Canvas at y=52, full width: 390x219, 360x203, 768x432 (r81 was ~390x120). Pause 58x44 and fullscreen sit in the strip |
| One-row action bar | Pass. 10 slots in a single row directly under the arena at 390, 360 and 768. At 768 the bar covers only the left ~63% of the width |
| 44 px skirts | Partial. Skirts show under slots 6 to = (Weather onward) but not under Blast, Flame, Charge (first three), so the bar's lower edge is ragged (finding 2) |
| Status chips (max 2, +N more) | Not fully exercised: only one chip (STUN) and one SAFE chip appeared at 390 and 768; could not force 3+ effects, so "+N more" is unverified |
| First-run card | Pass. One line ("Stick moves you. Tap the bar: 1 and 2 strike, plus Dash, Guard, Super."), "Got it" button, clear of stick and strikes. At 390 it is still ~110 px tall with the button on its own line |
| Thumb reach | Weak (finding 1) |

## New findings

1. Portrait 390x844: arena plus bar end at y~315, the stick and strikes start at y~690. About 370 px of empty black sits between them, and the bar (the Dash, Guard, Super taps) is at the top of the screen, farthest from the thumbs. Suggest a taller arena (the canvas could be 1.5-2x taller with a crop or zoom) or moving the bar down beside the strikes.
2. Skirt strip is missing under the first three bar slots at 390, 360 and 768, so the bar looks uneven. Probably deliberate for strike slots, but it reads as a bug.
3. e2e `portrait-play` fails at 390x844 and 360x640 on line 67: `expect(bar.y).toBeLessThan(canvas.y + canvas.h)` (received 483 vs 271; 372 vs 254). It is a stale assertion from before P3 moved the bar out from over the arena; it is deterministic (failed in the batch and again alone). The 768-wide and the other portrait-play tests pass.
4. 568x320 landscape: Strike 2 overlaps the foe sprite and Pause and fullscreen overlap the HUD's right edge. Playable but cramped.
5. Arcade picker (`#arcade` Fight) uses the lava floor for every pairing (water, earth, air heroes included, seeds 3 and 7), so "four element stages" were only seen in the Classic demo (`?ff=arenaDemo&p1=`): distinct dark water, misty air, etc. Worth checking if intended.
6. Classic demo uses an older plain HUD ("Curomo, rested, cap 100%") next to the polished Arcade HUD; not player-facing by menu.

## E2E (Chromium, 1 worker, port 7996)

portrait-play, responsive, phone-layout, touch-fight-layout: 87 passed, 2 failed (finding 3). Not run: lint, typecheck, vitest, full suite.

## Menus

Menu at 390x844 and 1280x720: five entries (Play, Versus, Online, Settings, Help), no mode words, version v0.1.0 (d96baa44). Help at 390: jump chips wrap cleanly. No console errors in any run.

## Triage 2026-11-21 (code-checked)

Fixed: skirts under the bar slots, stale portrait-play assertion, Arcade picker floor per element (verified r83). Dropped (phone/portrait/touch): items 1, 4 and the status-chip check. Not player-facing: item 6 (Classic demo HUD, no menu entry).
Open: none.
