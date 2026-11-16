---
status: in-progress
added: 2026-11-16
---

# FLOOR-TAGS-1: floor chips stay whole and off heads

Source: ideas/brainstorm/qa-r73-findings.md item 3 (chips such as "WATER +HP" cut off at the view edge or hidden under a drawn head).

Status: built on the worktree branch, not merged. View only (`src/game/fx/terrain-view.ts`, `terrain-fx.ts`); no sim or golden change.

- Per frame each chip is clamped inside the camera's view (`chipCentreX`, 16 px margin) and moves to the patch's other side while a drawn (up to 2x) fighter covers its base slot; it returns after 20 clear frames.
- `near` fade now also counts the drawn boxes.
- Probe: `terrain().view`, `.bodies`, per-chip `slot`.
- Not done: keeping chips off the HUD bars during the super punch zoom; chips under phone touch controls.
