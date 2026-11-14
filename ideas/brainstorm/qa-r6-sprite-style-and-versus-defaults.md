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

- Default matchup is Sindarosa (272 HP) vs Fiara (679 HP): unfair and unreadable for a first match. Pick defaults with similar HP, or level-match.
- Left panel says "You: Sindarosa" while the picker highlights Curomo, so it is unclear who will fight. Make the highlighted card and the panel one source of truth and show a clear "Selected" state.
- AI looks passive in the first seconds; check opening aggression on the default difficulty.
