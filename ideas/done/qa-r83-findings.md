---
status: done
triaged: superseded (portrait dropped; rest fixed or art-only)
added: 2026-11-16
---

# QA r83: findings (prioritised)

Screenshot dir: `.scratch/r83/shots/` in worktree agent-ada306f9d0e7f754b (gitignored). Compared against qa-r82-findings.md.

## Changes since r82

Improved:
- r82 #2 skirts missing under the first three bar slots: fixed. All ten slots have a skirt (`p390-fight1.png`).
- r82 #3 stale portrait-play e2e (line 67): gone, portrait-play 10/10 green.
- r82 #4 568-style overlap: at 667x375 and 844x390 Strike 1/2 and Pause sit in the right gutter, the foe is not covered (`l667-fight1.png`, `l844-fight1.png`; phone-layout e2e green).
- r82 #5 Arcade picker always lava: fixed, the Fire/Water/Earth/Air radios give four distinct floors (`stage-Fire.png`, `stage-Water.png`, `stage-Earth.png`, `stage-Air.png`).
- Wispera's new portrait is distinct from the other 11 in the select grid and HUD thanks to the white core (`select-1280x720.png`, `p390-fight1.png`).

Not improved: r82 #1 (portrait empty band). Regressed: nothing found.

## P1: portrait play is a postage stamp over a black void

The arena is about 390x250 CSS px at the top, then a dark band of about 400 px, then the stick and strikes. Fighters are tiny and the bar is far from the thumbs. Same at 360x640 and in Tour. Idea: scale the canvas to use the freed height (taller arena crop or zoomed camera), or move bar and controls up into the band.
Shots: `.scratch/r83/shots/p390-fight1.png`, `p390-super.png`, `tour-390-fight.png`.

## P2: super cinematic in portrait is cramped

"SIREN GALE" band fills most of the 250 px arena and the SAFE chip overlaps it; the caster is clipped at the left edge.
Shots: `.scratch/r83/shots/p390-super.png` vs desktop `super-wispera-a.png`.

## P3: Wispera is small and low-contrast on dark floors

Dark vapour on lava/earth is readable only because of the bright core. She is visibly smaller than Pax or Rokcore. Consider a pale outer rim or slightly larger body scale.
Shots: `.scratch/r83/shots/super-wispera-a.png`, `2v2-tag-a.png`, `select-1280x720.png`.

## P4: HUD life values are inconsistent across heroes

Wispera 757/757, Pax 690, Fiara 540, Lavax 400, Sindarosa 228 (Tour). Players cannot tell if numbers are comparable; consider showing percent-only or normalising display.
Shots: `.scratch/r83/shots/super-wispera-a.png`, `p390-fight1.png`, `tour-390-fight.png`.

## P5: Tour portrait HUD tag-portraits collide with the centre timer cluster

Tag portrait pairs sit over the WINS circles and timer at 390 wide.
Shot: `.scratch/r83/shots/tour-390-fight.png`.

## P6: Versus picker at 390 needs a long scroll

Opponent, Team, AI level, Arena stack before the hero cards; the hero grid is below the fold behind "More below". Consider putting the hero pick first on phones.
Shot: `.scratch/r83/shots/select-390x844.png`.

## Unverified

The "+N more" status chip was not triggered in any scripted fight. First-run card ("First Blood" hint) overlaps the lower arena on desktop at tag time (`2v2-tag-a.png`), minor.

## Method notes

Load was 11 to 16 for most of the run (other agents), above the requested 10. One e2e flake (World Tour portrait-rig test at 1280x720, 20 s timeout) passed on rerun; its error text was not captured.

## Triage 2026-11-21 (code-checked)

Fixed: bar skirts, stale e2e, 568-style overlap, Arcade floors. Dropped (phone/portrait): P1, P2, P5, P6. Art only, noted: P3 Wispera small and low-contrast (`ideas/brainstorm/qa-r127-tour-foe-scale-wispera.md`). Not a bug: P4 life values differ per hero by design (per-hero max life in `src/core/data`); desktop shows current/max.
Open: none.
