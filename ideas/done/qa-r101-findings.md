---
status: done
triaged: obsolete (2026-11-21: phone/portrait/touch work dropped by owner 2026-11-18; remaining items are portrait-only or contrived)
added: 2026-11-17
---

# QA r101 findings

Build: main at 4a64eeab, test mode, headless Chromium (SwiftShader). Shots in `.scratch/shots101/` of the r101 QA worktree (gitignored; vp codes d=1280x720, p390, p360).
e2e subset (portrait-play, responsive, match-end, online-copy-paste, 1 worker): 101 passed, 0 failed, 8.2 min. No console or page errors in any scripted run.

## Fixed since r100 (verified)

- Strike labels: DOM scan of every hero at 390 and 360 found no `text-overflow: ellipsis` overflow.
- 2v2 portrait camera after a tag swap: Pax and Sindarosa stay fully on screen at 390 and 360 (`2v2-tag-p390-b.png`, `2v2-tag-p360-b.png`; camera zoom 1.127).
- Match-end on phone: lose card buttons visible (Rematch bottom 473/844 at 390, 419/640 at 360).
- Online: role screen with "I am hosting" / "My friend is hosting" is clear; Help copy names Strike 1/2.

## P2

1. Strike 1 label still touches the circle edge. "Adrenaline" (Pax) fills the full width of the 390 button and "Rock Armr" (Rokcore, abbreviated) is cut by the circle curve; labels are not ellipsized but are clipped by the round border. Shots: `strike-pax-p390.png`, `super-p390-a.png`, `2v2-tag-p390-b.png`. Fix: shrink the label font for names over about 8 characters, or shorten the names ("Adren" is already used in the buff chip). Pointers: the touch Strike button CSS and label builder under `src/ui/` (search `touchStrike1`).
2. Portrait sky is still about half the screen at 390x844 and 360x640: the floor strip is small and fighters are about 80 px tall (`fight-*-p390-a.png`, `strike-pax-p390.png`). Biggest remaining graphics/readability cost in portrait; carried over from r100 P2. Pointers: `src/game/scenes/Arena.ts` camera fit, `src/game/fx/terrain-view`.
3. 2v2 and Tour action bars are two rows at 360 and cover the lower floor (`2v2-tag-p360-b.png`, `tour-fight-p360.png`); the Tag slot thumbnail overlaps its own cooldown text while on cooldown ("Tag 3s"). Carried over from r100.

## P3

4. Online role screen at 360: heading "Who is hosting?" wraps to two lines and "Back" appears twice (top and bottom bar) (`online-role-p360.png`). Pointers: `src/ui/` online screen.
5. Strike label text can read stale or empty right after a hero change in the DOM (Curomo at 360 read "Vines"/"Ice Shock", Pax/Fiara/Curomo labels were just "Strike 2"/"Strike 1" at 390 until later). Probably a timing effect of my script reading immediately; unverified, worth one assertion that the label updates within a frame of a hero or tag change.
6. Match-end win card was not captured (scripted round 2 did not end the match); only the lose card checked. A follow-up should drive both outcomes in a test.
7. Edge case, contrived: placing a fighter at x=120 in 2v2 portrait leaves it half off the left edge (`2v2-edge-p390.png`). Normal play did not reach this; check whether the camera clamps to arena bounds.

## Checked and fine

- Menu, Help and Online at desktop, 390 and 360: no overflow, no banned words (Classic/Arcade/Capture) seen.
- Four stages (fire, earth, air, water) render with distinct backdrops and floors at all viewports.
- Super banner (name and element), tag callout ("TAG!"), damage numbers and floor FX are legible.
