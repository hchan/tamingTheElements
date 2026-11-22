---
status: idea
triaged: c (P7 black strip under the arena at 1280x720 late blast unverified)
added: 2026-11-16
---

# QA r84 findings

## Changes since r83

Versus picker layout, Help Fire Blast falloff text, Fire Blast trail fade, and the new tall portrait view. All confirmed present; no page errors. Shots are under `.scratch/r84/shots/`.

## P1 Tall portrait: big empty sky void above the arena

The top ~40% of the tall box is a flat dark-red (Fire) or dark-maroon fill with only the ROUND/FIGHT banners, then a hard seam into the crowd and ground. At 390x844 the arena strip uses about 40% of the height and fighters are ~100px at spawn.
Shots: `.scratch/r84/shots/t390-2-spawn.png`, `t390-8-back-portrait.png`, `tour-390-fight.png` (Water stage: same void in maroon).
Fix: scale the background art to fill the sky (cover, anchored to the horizon), blend the seam with a gradient, and raise the camera zoom cap in portrait so fighters fill more of the box.

## P2 Tall portrait: fighters tiny at spawn range

About 100px sprites on 390 wide; hard to read at a glance versus SF/MvC.
Shots: `t390-2-spawn.png`, `t360-2-spawn.png`.
Fix: portrait spawn zoom closer (fit the two fighters with less margin), keep the current close-range zoom.

## P3 Tall portrait: ability bar shows an empty second row

The bar renders a blank dark row under the 10 slots, above the touch skirt, wasting about 100px.
Shots: `t360-3-close.png`, `t390-8-back-portrait.png`.
Fix: collapse the bar to one row height in the tall layout and give the space to the arena.

## P4 Versus picker at 360x640 is cramped

Fight/Back stack, and "More below" chips overlap content.
Shot: `versus-360x640.png`, `versus-360x640-full.png`.
Fix: sticky bottom action row; hide the chips when the content already fits; tighten vertical spacing.

## P5 HUD text collisions

Names truncate ("SINDAR...") at 390 and 360; in the landscape rotate the foe "life 143/321 HURT" text overlaps "SUPER 33%". Tour bench cards sit directly under the HUD names.
Shots: `t390-7-landscape.png`, `t390-8-back-portrait.png`, `tour-390-fight.png`.
Fix: drop the super percent or the life text when width is short (show only one), and add margin under the HUD for the bench cards.

## P6 Desktop: Water and Air stages look alike; Sindarosa blends into Fire lava

Both icy-blue; the red dragon on orange lava loses contrast.
Shots: `stage-Water-1280.png`, `stage-Air-1280.png`, `stage-Fire-1280.png`.
Fix: shift the Air palette toward pale gold or white-teal; add a dark rim or ground shadow under fighters on Fire.

## P7 Black strip under the arena at 1280x720 late blast

A thin black band under the ground in `blast-late.png`.
Shot: `blast-late.png`.
Fix: extend the ground fill to the bottom of the game box.

## P8 Tag swap not verified

Key '3' in manual-step mode did not swap heroes in the 2v2 check (`2v2-tag.png`). Probably a harness issue (needs a held key across steps), not confirmed as a bug.
Fix: re-test with a real key hold or the tag command bit; add an e2e assert if missing.

## Passed

First-run card (full width, under the HUD, "Got it" reachable); Help falloff text; Fire Blast fade; super cut-in fits under the HUD; rotate to landscape and back keeps the game state.

## Triage 2026-11-21 (code-checked)

Fixed: Help falloff text and Fire Blast trail fade (confirmed in the round), P6 Water/Air similarity (verified r85), P8 tag swap (verified r85). Dropped (phone/portrait): P1, P2, P3, P4, P5. Art only, tracked: Sindarosa on Fire lava (`ideas/brainstorm/qa-r128-fire-stage-hero-blend.md`).
Open (low): P7 thin black band under the ground in `blast-late.png`; no later round re-checked it, so it needs a 1280x720 screenshot after a late blast.
