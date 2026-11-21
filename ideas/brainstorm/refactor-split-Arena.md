---
status: idea
added: 2026-11-21
epic: [process-and-docs](../epics/process-and-docs.md)
---

# Refactor: split `src/game/scenes/Arena.ts`

- Current size: 824 lines (wc -l, 2026-11-21); grandfather cap in `tools/ci/size-grandfather.json`: 824.
- Goal: behaviour-preserving split, SOLID and small files (target under 500 lines each).
- Proposed seams: (1) replay playback (`attachPlayback`, `advancePlayback`, `reportPlayback`) as an `arena-playback` module; (2) low-health and announcer polling (`checkLowHealth`, `announce`, `announceEarlyTag`, `feedCleanse`); (3) position and motion sampling (`samplePos`, `simPositionOf`, `feedMotion`); (4) `create()` (about 200 lines) into setup steps; the test probe (`installProbe`) as `arena-probe`.
- Risk: Low: src/game is render-only (no sim state). Sonnet builds directly; check with a real-game screenshot or the touched e2e specs.
- Acceptance: `gate:commit` passes; the grandfather entry is removed or lowered; one REPO-MAP line per new file; no behaviour change (no golden or snapshot re-record).
