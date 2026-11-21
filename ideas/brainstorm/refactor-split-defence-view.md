---
status: idea
added: 2026-11-21
epic: [process-and-docs](../epics/process-and-docs.md)
---

# Refactor: split `src/game/fx/defence-view.ts`

- Current size: 704 lines (wc -l, 2026-11-21); grandfather cap in `tools/ci/size-grandfather.json`: 704.
- Goal: behaviour-preserving split, SOLID and small files (target under 500 lines each).
- Proposed seams: (1) pool sizes, depths and `DefenceState`/prefs types into `defence-types`; (2) `mountDefenceView` (the bulk of the file) into guard/dash/parry sub-mounts (sparks, rings, pops, dash afterimages); (3) rope loops and afterimage trails as their own helper module; (4) HUD-rect and bar drawing helpers.
- Risk: Low: src/game is render-only (no sim state). Sonnet builds directly; check with a real-game screenshot or the touched e2e specs.
- Acceptance: `gate:commit` passes; the grandfather entry is removed or lowered; one REPO-MAP line per new file; no behaviour change (no golden or snapshot re-record).
