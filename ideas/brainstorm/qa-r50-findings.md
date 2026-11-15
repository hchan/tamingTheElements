---
status: idea
added: 2026-11-15
---

# QA r50 findings (ranked)

HEAD 92acd490, dev server, headless Chromium SwiftShader, 0 page errors in every script. Screenshots under `~/claudetmp/qa-r50/s/`. Scores in qa-r50-scorecard.md.

## Open (ranked)

1. FIGHT! banner still overlaps the first hit: damage "1" glued to "FIGHT!" (`st-Fire-hit.png`). Also on `st-Water-hit.png` the banner sits on top of Wispera. Open since r47. Hide it on the first input or after about 0.6 s.
2. Per-element hit marks are not distinct enough by stills: the contact burst is a pale cyan star with a ring core on Fire, Water and Earth targets (`st-Fire-hit.png`, `st-Earth-super.png`, `ph-super.png`). Tint by attacker element (orange spark for Fire, green shards for Earth, etc.) or verify the tint is applied at these sizes.
3. Idle auras barely show: faint glow under Wispera (`st-Water-start.png`), none visible on Fiara (`st-Water-start.png`, `st-Air-super.png`). If the auras are meant to give an element read at rest, raise opacity or radius.
4. 2v2 Versus picker: sticky Fight bar covers the partner slot (Echo hidden) and the detail pane shows Sindarosa with "Add to team" while Fiara and Morblass are picked (`team2-picker-set.png`). The "More heroes below" pill exists now but the slot stays covered.
5. First-run hint ("FIRST BLOOD ... Got it") covers the bottom of the arena in 2v2 (`team2-tag-b.png`) and the upper left on phone (`ph-super.png`). Auto-dismiss after the first action.
6. Stray "ROUND" text ghosting behind the damage number during the TAG! call (`team2-tag-b.png`, centre behind "48"). One overlay should win.
7. Wispera sprite has a hard dithered pixel halo (`st-Water-start.png`, `st-Fire-hit.png`); menu hero cut-outs have dark contour noise around the rock (`menu-desk-late.png`). Left dragon is still cropped by the viewport edge.
8. Phone landscape (844x390): golem moved to the top right, clear of the title; only the red dragon wing tip touches "Taming" (`menu-ph-l.png`). Minor.
9. Art consistency: Tour card still mixes painted and blurry sprite portraits, flat purple card (`tour-card5.png`).
10. 2v2 life asymmetry (Echo 438 vs Morblass 375) is intended but not shown per hero in the picker.

## Fixed or improved since r49

- Play (Tour) picker has a "More heroes below" pill, Slot badges and Remove-from-team (`page-play.png`); the Earth row is still under the Start bar until scrolled, so partially fixed.
- Crowd-control HUD chips: SNAGGED 2s, STUN with icon, SAFE chip under the life bars (`team2-tag-b.png`, `ph-super.png`). Good and readable on phone.
- Cast-tint fix: no ice-blue tint on Fiara or Echo during casts in the shots reviewed (`st-Air-super.png`).
- Phone landscape title collision: mostly fixed (item 8).

## Working well

Menu on five viewports, per-element stage floors, super banner with element label (PHANTOM SQUALL, SIREN GALE, PHOENIX RISE), TAG! call with bench cards and cooldown, Tour ladder to stage 7, phone match to Victory 2-0, Help and Settings pages.

## Not verified

Playwright e2e was not run this round; hit-stop, the menu entrance animation and Online two-browser flow are not judgeable from stills.
