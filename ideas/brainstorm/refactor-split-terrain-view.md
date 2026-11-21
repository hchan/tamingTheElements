---
status: idea
added: 2026-11-21
epic: [process-and-docs](../epics/process-and-docs.md)
---

# Refactor: split `src/game/fx/terrain-view.ts`

- Current size: 631 lines (wc -l, 2026-11-21); grandfather cap in `tools/ci/size-grandfather.json`: 632.
- Goal: behaviour-preserving split, SOLID and small files (target under 500 lines each).
- Proposed seams: (1) constants and `TerrainState`/prefs into `terrain-types`; (2) `mountTerrainView` (about 480 lines) into background/tiles, glow, floor chips and ambient layers; (3) chip icon drawing (`icon`, label font/colour, plate alpha) as `terrain-chip-icons`; (4) label hint fade (`labelHintAlpha`, hint ticks).
- Risk: Low: src/game is render-only (no sim state). Sonnet builds directly; check with a real-game screenshot or the touched e2e specs.
- Acceptance: `gate:commit` passes; the grandfather entry is removed or lowered; one REPO-MAP line per new file; no behaviour change (no golden or snapshot re-record).
