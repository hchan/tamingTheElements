---
status: idea
added: 2026-11-13
---

# QA r6: legacy vs rigged sprite mismatch; Versus default matchup

Evidence: hero-*.png, hero2/3-*.png, pick-*.png, tour-*.png (~/claudetmp/qa6/).

## Sprites and portraits

- The rigged Sindarosa, Pax and Curomo look good (verified at 1920x1080) but flat: no rim light, no outline, no grounded contact shadow.
- Legacy Fiara, Lavax and Ishimi are low-res, jagged and pixelated next to them; side by side they look like two different games.
- Tour opponent portraits are blocky on flat blue boxes; hero faces in the HUD are fine.
- Suggest continuing ADR-0020 portrait rigs for the remaining heroes, and adding a shared shader or bake step (soft shadow, rim light) so old and new share a look.

## Versus setup

- DONE 2026-11-14: default matchup is now Sindarosa vs Rokcore (was Fiara: Sindarosa won 22% of 64 scripted Arcade seeds; Rokcore 42%, similar life).
- Left panel says "You: Sindarosa" while the picker highlights Curomo, so it is unclear who will fight. Make the highlighted card and the panel one source of truth and show a clear "Selected" state.
- AI looks passive in the first seconds; check opening aggression on the default difficulty.

## Progress (hero-contrast agent, 2026-11-14)

Sprites part: shared rim light landed (contact shadow already exists in Arcade) (see qa-r7-hero-contrast-and-sprite-look.md). Remaining legacy heroes still low-res; more portrait rigs (ADR-0020) would finish it. The Versus defaults part is owned elsewhere.
