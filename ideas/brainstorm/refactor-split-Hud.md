---
status: idea
added: 2026-11-21
epic: [process-and-docs](../epics/process-and-docs.md)
---

# Refactor: split `src/game/scenes/Hud.ts`

- Current size: 1219 lines (wc -l, 2026-11-21); grandfather cap in `tools/ci/size-grandfather.json`: 1245.
- Goal: behaviour-preserving split, SOLID and small files (target under 500 lines each).
- Proposed seams: (1) health bars and lost-life trail/super rim (`drawTrail`, `drawSuperRim`, `drawChip`); (2) status chips and legacy buffs (`drawStatusChips`, `drawLegacyBuffs`, `chipRects`, `hideChips`) as a `hud/status-chips` module; (3) portrait and arcade avatar drawing (`drawPortrait`, `placePortrait`, `drawArcadeAvatar`, `drawMark`); (4) test probes (`numberBoxes`, `popBoxes`, `textSizes`, `heroLabels`) as a `hud/hud-probe` module; layout constants into a `hud/hud-layout` module.
- Risk: Low: src/game is render-only (no sim state). Sonnet builds directly; check with a real-game screenshot or the touched e2e specs.
- Acceptance: `gate:commit` passes; the grandfather entry is removed or lowered; one REPO-MAP line per new file; no behaviour change (no golden or snapshot re-record).
